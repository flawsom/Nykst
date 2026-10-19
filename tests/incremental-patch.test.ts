import { describe, expect, test } from "bun:test";
import { analyzeRepository } from "../src/lib/analysis/engine.server";
import { loadParser } from "../src/lib/analysis/parse.server";
import { patchLoaded } from "../src/lib/analysis/patch.server";
import type { AnalyzedFile, RepoAnalysis } from "../src/lib/analysis/types";

const BASE: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", private: true }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
  }),
  "src/lib/a.ts": 'import { b } from "./b";\nexport const a = b + 1;\n',
  "src/lib/b.ts": "export const b = 1;\n",
  "src/lib/c.ts": 'import { a } from "@/lib/a";\nexport const c = a;\n',
  "src/lib/old.ts": 'import { b } from "./b";\nexport const old = b;\n',
  "src/lib/db.ts":
    'import { createClient } from "@supabase/supabase-js";\nconst supabase = createClient("x", "y");\nexport const users = () => supabase.from("users").select("id");\n',
  "supabase/migrations/001.sql": "create table users (\n  id uuid primary key,\n  email text\n);\n",
};

const { "src/lib/old.ts": _deleted, ...BASE_WITHOUT_OLD } = BASE;

const NEXT: Record<string, string> = {
  ...BASE_WITHOUT_OLD,
  "src/lib/b.ts": "export const b = 2;\nexport const b2 = 3;\n",
  "src/lib/d.ts": 'import { b2 } from "./b";\nexport const d = b2;\n',
  "src/lib/db.ts":
    'import { createClient } from "@supabase/supabase-js";\nconst supabase = createClient("x", "y");\nexport const teams = () => supabase.from("teams").select("id");\n',
  "supabase/migrations/001.sql":
    "create table users (\n  id uuid primary key,\n  email text\n);\n\ncreate table teams (\n  id uuid primary key,\n  name text\n);\n",
};

async function compile(sources: Record<string, string>, ref = "test") {
  return analyzeRepository({
    ref,
    paths: Object.keys(sources),
    contents: new Map(Object.entries(sources)),
  });
}

describe("incremental graph patching", () => {
  test("a patch matches a cold compile for files, edges, cycles, resources and stats", async () => {
    const before = await compile(BASE, "before");
    const after = await compile(NEXT, "after");
    const patched = patchLoaded(before, [
      { path: "src/lib/b.ts", content: NEXT["src/lib/b.ts"]! },
      { path: "src/lib/d.ts", content: NEXT["src/lib/d.ts"]! },
      { path: "src/lib/old.ts", content: null },
      { path: "src/lib/db.ts", content: NEXT["src/lib/db.ts"]! },
      { path: "supabase/migrations/001.sql", content: NEXT["supabase/migrations/001.sql"]! },
    ]);

    expect(patched.files).toEqual(after.files);
    expect(patched.cycles).toEqual(after.cycles);
    expect(patched.resources).toEqual(after.resources);
    expect(patched.envVars).toEqual(after.envVars);
    expect(patched.memory).toEqual(after.memory);
    expect(patched.resolver).toEqual(after.resolver);
    expect(patched.stats.internalEdges).toBe(after.stats.internalEdges);
    expect(patched.stats.sourceFiles).toBe(after.stats.sourceFiles);
    expect(patched.stats.analyzedFiles).toBe(after.stats.analyzedFiles);
    expect(patched.stats.unresolvedImports).toBe(after.stats.unresolvedImports);
    expect(patched.stats.externalPackages).toBe(after.stats.externalPackages);
    expect(patched.stats.loc).toBe(after.stats.loc);
    expect(patched.stats.treeFiles).toBe(after.stats.treeFiles);
    expect(patched.files.some((file) => file.path === "src/lib/old.ts")).toBe(false);
    expect(patched.files.some((file) => file.path === "src/lib/d.ts")).toBe(true);
    expect(patched.resources.some((resource) => resource.id === "table:teams")).toBe(true);
  });

  test("deleting a file prunes its dependents edges and services", async () => {
    const before = await compile(BASE);
    const patched = patchLoaded(before, [{ path: "src/lib/b.ts", content: null }]);

    expect(patched.files.map((file) => file.path)).not.toContain("src/lib/b.ts");
    expect(patched.stats.internalEdges).toBeLessThan(before.stats.internalEdges);
    expect(patched.stats.analyzedFiles).toBe(before.stats.analyzedFiles - 1);
    for (const file of patched.files)
      expect(file.imports.some((ref) => ref.target === "src/lib/b.ts")).toBe(false);
  });

  test("patches 500 files in under 15ms", async () => {
    await loadParser();
    const files: AnalyzedFile[] = Array.from({ length: 500 }, (_, index) => ({
      path: `src/f${index}.ts`,
      language: "ts",
      loc: 4,
      packageDir: "",
      role: "lib",
      imports:
        index < 499
          ? [
              {
                specifier: `./f${index + 1}`,
                line: 1,
                kind: "internal",
                target: `src/f${index + 1}.ts`,
                typeOnly: false,
                dynamic: false,
              },
            ]
          : [],
      exports: [`f${index}`],
      functions: [],
      classes: [],
      envVars: [],
      services: [],
      resources: [],
      endpoints: [],
    }));
    const analysis: RepoAnalysis = {
      version: 2,
      generatedAt: "2026-01-01T00:00:00.000Z",
      method: "typescript-ast",
      ref: "large",
      packages: [],
      files,
      services: [],
      resources: [],
      envVars: [],
      cycles: [],
      resolver: { aliases: [], manifests: [] },
      stats: {
        treeFiles: files.length,
        sourceFiles: files.length,
        analyzedFiles: files.length,
        internalEdges: files.reduce((sum, file) => sum + file.imports.length, 0),
        externalPackages: 0,
        unresolvedImports: 0,
        skippedFiles: 0,
        loc: files.reduce((sum, file) => sum + file.loc, 0),
        durationMs: 1,
      },
      limitations: [],
    };

    const started = performance.now();
    const patched = patchLoaded(analysis, [
      {
        path: "src/f250.ts",
        content: 'import { f251 } from "./f251";\nexport const f250 = f251;\n',
      },
    ]);
    const elapsed = performance.now() - started;

    expect(patched.files).toHaveLength(500);
    expect(patched.stats.internalEdges).toBe(499);
    expect(patched.stats.durationMs).toBeLessThan(15);
    expect(elapsed).toBeLessThan(50);
  });
});
