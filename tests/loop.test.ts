import { describe, expect, test } from "bun:test";
import {
  LOOP_SCENARIOS,
  LOOP_STAGES,
  computeFinOps,
  coveringTestCommand,
  estimateTokens,
  extractGeneratedCode,
  relativeSpecifier,
  scenarioContent,
  summarizeVerdict,
} from "../src/lib/loop";

const SOURCE = [
  'import { helper } from "./helper";',
  "",
  "export function parseRepoSlug(value: string) {",
  "  return value.split('/');",
  "}",
  "",
  "export const LIMIT = 10;",
].join("\n");

describe("loop scenarios", () => {
  test("declares four stages and every scenario the engine offers", () => {
    expect(LOOP_STAGES.map((stage) => stage.testId)).toEqual([
      "loop-stage-1",
      "loop-stage-2",
      "loop-stage-3",
      "loop-stage-4",
    ]);
    expect(LOOP_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "remove-export",
      "unresolved-import",
      "dropped-column",
      "circular-import",
      "clean-enhancement",
    ]);
    expect(LOOP_SCENARIOS.filter((scenario) => scenario.expectation === "safe")).toHaveLength(1);
  });

  test("an unresolved import points at a missing folder and changes exactly one line", () => {
    const result = scenarioContent(SOURCE, "unresolved-import", {
      path: "src/lib/integrations/github.ts",
    });
    const added = result.content.split("\n")[0]!;
    expect(added).toBe('import "./__nykst_missing__/utils";');
    expect(result.line).toBe(1);
    expect(result.content.split("\n").length).toBe(SOURCE.split("\n").length + 1);
    expect(result.content.endsWith(SOURCE)).toBe(true);
  });

  test("circular import uses the real downstream importer", () => {
    const result = scenarioContent(SOURCE, "circular-import", {
      path: "src/lib/analysis/impact.ts",
      directImporter: "src/lib/analysis/context.ts",
    });
    expect(result.content.trimEnd().endsWith('import "./context";')).toBe(true);
    expect(result.line).toBeGreaterThan(1);
  });

  test("circular import is skipped when no importer exists", () => {
    const result = scenarioContent(SOURCE, "circular-import", {
      path: "src/lib/analysis/impact.ts",
      directImporter: null,
    });
    expect(result.content).toBe(SOURCE);
    expect(result.line).toBeNull();
  });

  test("dropped column is an unknown literal, never a known column", () => {
    const result = scenarioContent(SOURCE, "dropped-column", {
      path: "src/lib/integrations/github.ts",
      table: { name: "repository_ingestions", column: "nykst_simulated_dropped_column" },
    });
    expect(result.content).toContain(
      'supabase.from("repository_ingestions").select("id, nykst_simulated_dropped_column")',
    );
    expect(result.summary).toContain("repository_ingestions.nykst_simulated_dropped_column");
  });

  test("remove-export drops exactly the export keyword from the first declaration", () => {
    const result = scenarioContent(SOURCE, "remove-export", { path: "src/x.ts" });
    expect(result.content).toContain("\nfunction parseRepoSlug(value: string) {");
    expect(result.content).not.toContain("export function parseRepoSlug");
    expect(result.content).toContain("export const LIMIT = 10;");
    expect(result.line).toBe(3);
  });

  test("clean enhancement only appends a new export", () => {
    const result = scenarioContent(SOURCE, "clean-enhancement", { path: "src/x.ts" });
    expect(result.content.startsWith(SOURCE)).toBe(true);
    expect(result.content).toContain('export const nykstLoopVerified = "src/x.ts";');
    expect(result.content).toContain("export function parseRepoSlug(");
    expect(result.line).toBe(SOURCE.split("\n").length + 1);
  });
});

describe("relativeSpecifier", () => {
  test("resolves sibling, parent and nested modules", () => {
    expect(relativeSpecifier("src/lib/a.ts", "src/lib/b.ts")).toBe("./b");
    expect(relativeSpecifier("src/lib/integrations/github.ts", "src/lib/code-links.ts")).toBe(
      "../code-links",
    );
    expect(relativeSpecifier("src/a.ts", "src/lib/deep/b.tsx")).toBe("./lib/deep/b");
    expect(relativeSpecifier("src/lib/a.ts", "src/other/b.ts")).toBe("../other/b");
  });
});

describe("FinOps", () => {
  test("measures the bounded envelope exactly and reports a real reduction", () => {
    const envelope = { path: "src/lib/a.ts", importers: 3 };
    const finops = computeFinOps(envelope, { loc: 36122, analyzedFiles: 203 });
    expect(finops.boundedBytes).toBe(JSON.stringify(envelope).length);
    expect(finops.boundedTokens).toBe(estimateTokens(JSON.stringify(envelope)));
    expect(finops.blindTokens).toBe(Math.ceil((36122 * 40) / 4));
    expect(finops.reductionPct).toBeGreaterThan(90);
    expect(finops.analysedFiles).toBe(203);
    expect(finops.basis).toContain("36,122");
  });

  test("never reports a negative or impossible reduction", () => {
    const finops = computeFinOps("x".repeat(10_000), { loc: 1 });
    expect(finops.blindTokens).toBeGreaterThanOrEqual(finops.boundedTokens);
    expect(finops.reductionPct).toBe(0);
  });
});

describe("summarizeVerdict", () => {
  const base = {
    before: { cycles: 2, unresolved: 0, columnDrift: 0 },
    after: { cycles: 2, unresolved: 0, columnDrift: 0 },
    newCycles: [] as string[][],
    newUnresolved: [] as { path: string; line: number; specifier: string }[],
    removedExports: [] as string[],
    brokenCallers: [] as {
      path: string;
      line: number;
      imports: string;
      typeOnly: boolean;
    }[],
  };

  test("certifies a clean overlay", () => {
    const verdict = summarizeVerdict(base);
    expect(verdict.verdict).toBe("safe");
    expect(verdict.headline).toBe("NO ISSUES FOUND IN ANALYZED CHECKS");
    expect(verdict.whatBroke).toEqual([]);
  });

  test("does not treat an older snapshot with missing caller evidence as a clean check", () => {
    const verdict = summarizeVerdict({ ...base, missingSymbolUsageFiles: ["src/old.ts"] });
    expect(verdict.verdict).toBe("breaking");
    expect(verdict.whatBroke.join(" ")).toContain("re-analyze");
  });

  test("blocks a new cycle and cites the cycle path", () => {
    const verdict = summarizeVerdict({
      ...base,
      after: { ...base.after, cycles: 3 },
      newCycles: [["src/a.ts", "src/b.ts"]],
    });
    expect(verdict.verdict).toBe("breaking");
    expect(verdict.newCycleCount).toBe(1);
    expect(verdict.whatBroke[0]).toContain("src/a.ts → src/b.ts");
  });

  test("blocks an unresolved import and removed export together", () => {
    const verdict = summarizeVerdict({
      ...base,
      after: { ...base.after, unresolved: 1 },
      newUnresolved: [{ path: "src/a.ts", line: 1, specifier: "./missing" }],
      removedExports: ["parseRepoSlug"],
      brokenCallers: [{ path: "src/b.ts", line: 4, imports: "src/a", typeOnly: false }],
    });
    expect(verdict.verdict).toBe("breaking");
    expect(verdict.newUnresolvedCount).toBe(1);
    expect(verdict.removedExportCount).toBe(1);
    expect(verdict.callerCount).toBe(1);
    expect(verdict.whatBroke.join(" ")).toContain("src/a.ts:1 → ./missing");
  });

  test("blocks new column drift and ignores pre-existing drift", () => {
    expect(summarizeVerdict(base).driftDelta).toBe(0);
    const verdict = summarizeVerdict({
      ...base,
      before: { ...base.before, columnDrift: 4 },
      after: { ...base.after, columnDrift: 5 },
    });
    expect(verdict.verdict).toBe("breaking");
    expect(verdict.driftDelta).toBe(1);
  });
});

describe("extractGeneratedCode", () => {
  test("extracts a fenced TypeScript block and ignores surrounding prose", () => {
    const answer =
      "Here is the change.\n```ts\nexport const value = 1;\n```\nThis keeps the contract.";
    expect(extractGeneratedCode(answer)).toBe("export const value = 1;");
  });

  test("accepts the BEGIN_FILE markers used by the coding route", () => {
    expect(extractGeneratedCode("BEGIN_FILE\nexport const a = 2;\nEND_FILE")).toBe(
      "export const a = 2;",
    );
  });

  test("returns null for prose so an answer cannot overwrite source", () => {
    expect(extractGeneratedCode("You should rename the function and run the tests.")).toBeNull();
    expect(extractGeneratedCode("")).toBeNull();
  });
});

describe("coveringTestCommand", () => {
  test("deduplicates real test paths", () => {
    expect(coveringTestCommand([])).toBe("bun test ./tests");
    expect(coveringTestCommand(["tests/a.test.ts", "tests/a.test.ts", "tests/b.test.ts"])).toBe(
      "bun test tests/a.test.ts tests/b.test.ts",
    );
  });
});
