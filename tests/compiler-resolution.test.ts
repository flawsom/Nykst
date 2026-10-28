import { describe, expect, test } from "bun:test";
import { analyzeRepository } from "../src/lib/analysis/engine.server";
import { generateFixPatch } from "../src/lib/analysis/fix";
import { buildLoopRun } from "../src/lib/analysis/loop.server";
import { resolveExportOrigin } from "../src/lib/analysis/reexports";
import { simulateChange } from "../src/lib/analysis/simulate";

async function analyze(contents: Record<string, string>) {
  return analyzeRepository({
    ref: "test",
    paths: Object.keys(contents),
    contents: new Map(Object.entries(contents)),
  });
}

function snapshot(contents: Record<string, string>) {
  return analyze(contents).then((analysis) => ({
    repository_full_name: "acme/demo",
    created_at: "2026-01-01T00:00:00.000Z",
    analysis,
    history: undefined,
  }));
}

describe("scope-aware resolver", () => {
  test("merges function overloads into one arity envelope", async () => {
    const analysis = await analyze({
      "src/format.ts": [
        "export function fmt(value: string): string;",
        "export function fmt(value: number, radix: number): string;",
        "export function fmt(value: string | number, radix?: number): string {",
        "  return String(value) + (radix ?? 10);",
        "}",
        "",
      ].join("\n"),
    });
    const symbol = analysis.files[0]?.symbols?.find((item) => item.name === "fmt");
    expect(symbol?.requiredArity).toBe(1);
    expect(symbol?.arity).toBe(2);
    expect(symbol?.overloadCount).toBe(2);
  });

  test("detects a namespace call that no longer satisfies the arity envelope", async () => {
    const before = await snapshot({
      "src/lib/util.ts":
        "export function pad(value: string, width: number) { return value.padStart(width); }\n",
      "src/consumer.ts":
        'import * as util from "./lib/util";\nexport const label = util.pad("x");\n',
    });
    const result = await simulateChange(before, [
      {
        path: "src/lib/util.ts",
        content:
          "export function pad(value: string, width: number, fill: string) { return value.padStart(width, fill); }\n",
      },
    ]);
    expect(result.signature_arity_breaks).toEqual([
      {
        targetPath: "src/lib/util.ts",
        symbolName: "pad",
        importerPath: "src/consumer.ts",
        callLine: 2,
        passedArgs: 1,
        expectedArity: "3+",
      },
    ]);
  });

  test("follows export * and renamed barrel exports to the declaring file", async () => {
    const before = await snapshot({
      "src/lib/impl.ts": "export function greet(name: string) { return `hi ${name}`; }\n",
      "src/lib/other.ts": "export const other = 1;\n",
      "src/lib/index.ts": 'export { greet as hello } from "./impl";\nexport * from "./other";\n',
      "src/consumer.ts": 'import { hello } from "./lib";\nexport const x = hello("a");\n',
    });
    expect(resolveExportOrigin(before.analysis, "src/lib/index.ts", "hello")).toMatchObject({
      path: "src/lib/impl.ts",
      name: "greet",
    });
    const result = await simulateChange(before, [
      {
        path: "src/lib/impl.ts",
        content:
          "export function greet(name: string, punctuation: string) { return `hi ${name}${punctuation}`; }\n",
      },
    ]);
    expect(result.signature_arity_breaks).toHaveLength(1);
    expect(result.signature_arity_breaks[0]).toMatchObject({
      targetPath: "src/lib/impl.ts",
      symbolName: "greet",
      importerPath: "src/consumer.ts",
      callLine: 2,
    });
  });

  test("ignores a call through a lexically shadowed import binding", async () => {
    const before = await snapshot({
      "src/lib/util.ts": "export function pad(value: string, width: number) { return value; }\n",
      "src/consumer.ts": [
        'import { pad } from "./lib/util";',
        "export const run = () => {",
        "  const pad = (value: string) => value;",
        '  return pad("x");',
        "};",
        "",
      ].join("\n"),
    });
    const result = await simulateChange(before, [
      {
        path: "src/lib/util.ts",
        content:
          "export function pad(value: string, width: number, fill: string) { return value; }\n",
      },
    ]);
    expect(result.signature_arity_breaks).toHaveLength(0);
  });
});

describe("four-strategy auto-healer", () => {
  test("makes a newly required trailing parameter optional", async () => {
    const before = await snapshot({
      "src/lib/util.ts": "export function pad(value: string) { return value; }\n",
      "src/consumer.ts": 'import { pad } from "./lib/util";\nexport const x = pad("a");\n',
    });
    const draft =
      "export function pad(value: string, width: number) { return value.padStart(width); }\n";
    const result = await generateFixPatch(before, { path: "src/lib/util.ts", content: draft });
    expect(result.verified).toBe(true);
    expect(result.strategiesApplied).toContain("arity_and_export_compatibility_shim");
    expect(result.healedContent).toContain("width?: number");
    expect(result.patch).toContain("+export function pad(value: string, width?: number)");
  });

  test("restores an export keyword that a caller still depends on", async () => {
    const before = await snapshot({
      "src/lib/greet.ts": "export function greet(name: string) { return `hi ${name}`; }\n",
      "src/consumer.ts": 'import { greet } from "./lib/greet";\nexport const x = greet("a");\n',
    });
    const draft = "function greet(name: string) { return `hi ${name}`; }\n";
    const result = await generateFixPatch(before, { path: "src/lib/greet.ts", content: draft });
    expect(result.verified).toBe(true);
    expect(result.strategiesApplied).toContain("arity_and_export_compatibility_shim");
    expect(result.healedContent).toContain("export { greet };");
  });

  test("breaks a runtime cycle by converting a type-only edge", async () => {
    const before = await snapshot({
      "src/lib/a.ts": "export const aValue = 1;\n",
      "src/lib/b.ts":
        'import { aValue } from "./a";\nexport interface Thing { value: number }\nexport const bValue = aValue;\n',
    });
    const draft =
      'import { Thing } from "./b";\nexport type AThing = Thing;\nexport const aValue = 1;\n';
    const result = await generateFixPatch(before, { path: "src/lib/a.ts", content: draft });
    expect(result.verified).toBe(true);
    expect(result.strategiesApplied).toContain("runtime_cycle_to_import_type");
    expect(result.healedContent).toContain('import type { Thing } from "./b";');
    expect(result.verification.cycles_after).toBe(0);
  });

  test("renames a drifted literal column to the active DDL column", async () => {
    const before = await snapshot({
      "supabase/migrations/001_users.sql":
        "create table if not exists public.users (\n  id uuid primary key,\n  email text\n);\n",
      "src/lib/data.ts": 'export const q = supabase.from("users").select("id, email");\n',
    });
    const draft = 'export const q = supabase.from("users").select("id, emial");\n';
    const result = await generateFixPatch(before, { path: "src/lib/data.ts", content: draft });
    expect(result.verified).toBe(true);
    expect(result.strategiesApplied).toContain("sql_column_drift_rename");
    expect(result.healedContent).toContain('select("id, email")');
  });
});

describe("trinity diagnostics", () => {
  test("builds WHAT, WHY, architectural reason and a causal chain from real facts", async () => {
    const before = await snapshot({
      "src/lib/greet.ts": "export function greet(name: string) { return `hi ${name}`; }\n",
      "src/consumer.ts": 'import { greet } from "./lib/greet";\nexport const x = greet("a");\n',
    });
    const draft = "function greet(name: string) { return `hi ${name}`; }\n";
    const run = await buildLoopRun(before, {
      path: "src/lib/greet.ts",
      content: draft,
    });
    const finding = run.stage3.findings.find((item) => item.kind === "removed_export")!;
    expect(finding.whatBroke).toContain("greet");
    expect(finding.why).toContain("src/consumer.ts");
    expect(finding.architecturalReason).toContain("direct importers");
    expect(finding.causalChain.length).toBeGreaterThan(0);
    expect(finding.causalChain[0]).toMatchObject({
      fromPath: "src/lib/greet.ts",
      toPath: "src/consumer.ts",
      importLine: 1,
    });
    expect(run.stage4.heal?.verified).toBe(true);
    expect(run.stage4.heal?.strategies).toContain("arity_and_export_compatibility_shim");
  });
});
