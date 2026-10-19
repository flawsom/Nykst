import { describe, expect, test } from "bun:test";
import { analyzeRepository } from "../src/lib/analysis/engine.server";
import { generateFixPatch } from "../src/lib/analysis/fix";
import { patchRepositoryAnalysis } from "../src/lib/analysis/patch.server";
import { simulateChange } from "../src/lib/analysis/simulate";

async function analyze(contents: Record<string, string>) {
  return analyzeRepository({
    ref: "test",
    paths: Object.keys(contents),
    contents: new Map(Object.entries(contents)),
  });
}

const SUPABASE = [
  'import { createClient } from "@supabase/supabase-js";',
  'const supabase = createClient("https://example.supabase.co", "key");',
  'supabase.from("users").select("id, email, legacy").eq("plan", "pro").eq("missing", "x");',
].join("\n");

describe("exported symbol signatures", () => {
  test("records function arity, parameter types, return type and type properties", async () => {
    const analysis = await analyze({
      "src/api.ts": [
        "export interface User {",
        "  id: string;",
        "  displayName?: string;",
        "  readonly role: Role;",
        "}",
        'export type Role = "admin" | "user";',
        "export async function loadUser(id: string, options?: { fresh: boolean }): Promise<User> {",
        "  void options;",
        '  return { id, role: "user" };',
        "}",
        "export class Session {",
        "  readonly token: string;",
        '  private secret = "x";',
        "}",
        "export const handler = (event: { id: string }, retries = 2): number => retries;",
      ].join("\n"),
    });
    const file = analysis.files.find((candidate) => candidate.path === "src/api.ts")!;
    const loadUser = file.symbols?.find((symbol) => symbol.name === "loadUser");
    const user = file.symbols?.find((symbol) => symbol.name === "User");
    const session = file.symbols?.find((symbol) => symbol.name === "Session");
    const handler = file.symbols?.find((symbol) => symbol.name === "handler");

    expect(loadUser).toMatchObject({
      kind: "function",
      arity: 2,
      requiredArity: 1,
      returnType: "Promise<User>",
    });
    expect(loadUser?.parameters?.[0]).toEqual({
      name: "id",
      type: "string",
      optional: false,
      rest: false,
    });
    expect(user?.kind).toBe("interface");
    expect(user?.typeProperties).toEqual([
      { name: "id", type: "string", optional: false, readonly: false },
      { name: "displayName", type: "string", optional: true, readonly: false },
      { name: "role", type: "Role", optional: false, readonly: true },
    ]);
    expect(session?.typeProperties).toEqual([
      { name: "token", type: "string", optional: false, readonly: true },
    ]);
    expect(handler).toMatchObject({ kind: "function", arity: 2, requiredArity: 1 });
  });

  test("incremental patching refreshes signatures from the changed file", async () => {
    const analysis = await analyze({
      "src/api.ts": "export function before(a: string) { return a; }\n",
    });
    const patched = await patchRepositoryAnalysis(analysis, [
      {
        path: "src/api.ts",
        content: "export function after(a: string, b?: number): string { return a + (b ?? 0); }\n",
      },
    ]);
    const file = patched.files.find((candidate) => candidate.path === "src/api.ts")!;
    expect(file.symbols?.[0]).toMatchObject({
      name: "after",
      arity: 2,
      requiredArity: 1,
      returnType: "string",
    });
  });
});

describe("column-level SQL contract drift", () => {
  test("replays migrations and flags dropped and unknown columns", async () => {
    const analysis = await analyze({
      "supabase/migrations/001_init.sql": [
        "create table users (",
        "  id uuid primary key,",
        "  email text not null,",
        "  display_name text,",
        "  legacy text",
        ");",
        "alter table users add column plan text;",
      ].join("\n"),
      "supabase/migrations/002_drop.sql": "alter table users drop column legacy;\n",
      "src/lib/users.ts": SUPABASE,
    });
    const table = analysis.resources.find((resource) => resource.id === "table:users")!;

    expect(table.columns?.map((column) => column.name)).toEqual([
      "id",
      "email",
      "display_name",
      "plan",
    ]);
    expect(table.columnDrift).toEqual([
      {
        kind: "dropped-column",
        table: "users",
        column: "legacy",
        message: "Code still references users.legacy, but a migration dropped it.",
        references: [{ path: "src/lib/users.ts", line: 3, operation: "select" }],
      },
      {
        kind: "unknown-column",
        table: "users",
        column: "missing",
        message: "Code references users.missing, which no analyzed migration declares.",
        references: [{ path: "src/lib/users.ts", line: 3, operation: "eq" }],
      },
    ]);
  });

  test("incremental SQL patches move drift without reparsing unrelated files", async () => {
    const analysis = await analyze({
      "supabase/migrations/001_init.sql":
        "create table users (id uuid primary key, email text not null);\n",
      "src/lib/users.ts": SUPABASE,
    });
    const before = analysis.resources.find((resource) => resource.id === "table:users")!;
    expect(before.columnDrift?.map((finding) => finding.column)).toEqual([
      "legacy",
      "missing",
      "plan",
    ]);

    const patched = await patchRepositoryAnalysis(analysis, [
      {
        path: "supabase/migrations/002_columns.sql",
        content:
          "alter table users add column legacy text;\nalter table users add column plan text;\n",
      },
    ]);
    const after = patched.resources.find((resource) => resource.id === "table:users")!;
    expect(after.columns?.map((column) => column.name)).toContain("plan");
    expect(after.columnDrift?.map((finding) => finding.column)).toEqual(["missing"]);
  });
});

describe("simulate_change and generate_fix_patch", () => {
  const source = ['import { bar } from "./nested/bar";', "export const foo = bar + 1;", ""].join(
    "\n",
  );
  const lib = {
    "src/lib/foo.ts": source,
    "src/lib/bar.ts": "export const bar = 1;\n",
    "src/lib/consumer.ts": 'import { bar } from "./bar";\nexport const value = bar;\n',
  };

  test("simulates a deletion without mutating the stored snapshot", async () => {
    const analysis = await analyze(lib);
    const snapshot = {
      repository_full_name: "flawsom/nykst",
      created_at: "2026-01-01T00:00:00.000Z",
      analysis,
      history: undefined,
    };
    const result = await simulateChange(snapshot, [{ path: "src/lib/bar.ts", content: null }]);

    expect(result.overlay).toMatchObject({
      persisted: false,
      deleted: ["src/lib/bar.ts"],
    });
    expect(result.deleted_impact?.direct_importers.map((item) => item.path)).toEqual([
      "src/lib/consumer.ts",
    ]);
    expect(snapshot.analysis.files.some((file) => file.path === "src/lib/bar.ts")).toBe(true);
    expect(result.after.files).toBe(2);
  });

  test("builds a diff only after the in-memory graph verifies it", async () => {
    const analysis = await analyze(lib);
    const result = await generateFixPatch(
      {
        repository_full_name: "flawsom/nykst",
        created_at: "2026-01-01T00:00:00.000Z",
        analysis,
        history: undefined,
      },
      { path: "src/lib/foo.ts", content: source },
    );

    expect(result.verified).toBe(true);
    expect(result.patch).toContain('-import { bar } from "./nested/bar";');
    expect(result.patch).toContain('+import { bar } from "./bar";');
    expect(result.verification).toMatchObject({
      unresolved_before: 1,
      unresolved_after: 0,
      persisted: false,
    });
  });

  test("refuses to guess when the file content is missing", async () => {
    const analysis = await analyze(lib);
    const result = await generateFixPatch(
      {
        repository_full_name: "flawsom/nykst",
        created_at: "2026-01-01T00:00:00.000Z",
        analysis,
        history: undefined,
      },
      { path: "src/lib/foo.ts" },
    );

    expect(result.verified).toBe(false);
    expect(result.needs_content).toBe(true);
  });
});
