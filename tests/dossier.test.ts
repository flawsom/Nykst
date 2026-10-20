import { describe, expect, test } from "bun:test";
import { buildNodeDossier } from "../src/lib/dossier";
import type { AnalyzedFile, RepoAnalysis } from "../src/lib/analysis/types";

function file(
  path: string,
  options: {
    imports?: string[];
    role?: AnalyzedFile["role"];
    resources?: { id: string; line: number }[];
    symbols?: AnalyzedFile["symbols"];
  } = {},
): AnalyzedFile {
  return {
    path,
    language: "ts",
    loc: 12,
    packageDir: "",
    role: options.role ?? "lib",
    imports: (options.imports ?? []).map((target, index) => ({
      specifier: `./${target.split("/").pop()}`,
      line: index + 1,
      kind: "internal" as const,
      target,
      typeOnly: false,
      dynamic: false,
    })),
    exports: options.symbols?.map((symbol) => symbol.name) ?? [],
    functions: [],
    classes: [],
    envVars: [],
    services: [],
    resources: options.resources ?? [],
    endpoints: [],
    ...(options.symbols ? { symbols: options.symbols } : {}),
  };
}

function analysis(files: AnalyzedFile[]): RepoAnalysis {
  return {
    version: 2,
    generatedAt: "2026-01-01T00:00:00.000Z",
    method: "typescript-ast",
    ref: "test",
    packages: [],
    files,
    services: [],
    resources: [
      {
        id: "table:users",
        kind: "table",
        name: "users",
        service: "supabase",
        definedIn: ["supabase/migrations/001.sql"],
        uses: [{ path: "src/lib/auth.ts", line: 9 }],
        columns: [{ name: "id", type: "uuid", nullable: false }],
        columnDrift: [
          {
            kind: "unknown-column",
            table: "users",
            column: "display_name",
            message: "users.display_name does not exist in the analyzed migrations.",
            references: [{ path: "src/lib/auth.ts", line: 9, operation: "select" }],
          },
        ],
      },
    ],
    envVars: [],
    cycles: [],
    stats: {
      treeFiles: files.length,
      sourceFiles: files.length,
      analyzedFiles: files.length,
      internalEdges: files.reduce((sum, item) => sum + item.imports.length, 0),
      externalPackages: 0,
      unresolvedImports: 0,
      skippedFiles: 0,
      loc: 12,
      durationMs: 1,
    },
    limitations: [],
  };
}

const COVERED = analysis([
  file("src/lib/auth.ts", {
    resources: [{ id: "table:users", line: 9 }],
    symbols: [
      {
        name: "verifySession",
        kind: "function",
        line: 14,
        arity: 2,
        requiredArity: 1,
        returnType: "Promise<Session>",
      },
    ],
  }),
  file("src/lib/session.ts", { imports: ["src/lib/auth.ts"] }),
  file("src/routes/api.login.ts", { imports: ["src/lib/session.ts"], role: "api" }),
  file("tests/auth.test.ts", { imports: ["src/lib/auth.ts"], role: "test" }),
]);

describe("buildNodeDossier", () => {
  test("lists importers with the exact importing line", () => {
    const sections = buildNodeDossier(COVERED, ["src/lib/auth.ts"]);
    const importers = sections.find((section) => section.id === "importers")!;
    expect(importers.total).toBe(2);
    expect(importers.rows.map((row) => row.path).sort()).toEqual([
      "src/lib/session.ts",
      "tests/auth.test.ts",
    ]);
    expect(importers.rows.every((row) => typeof row.line === "number")).toBe(true);
  });

  test("follows reverse reachability to entrypoints and tests", () => {
    const sections = buildNodeDossier(COVERED, ["src/lib/auth.ts"]);
    const dependents = sections.find((section) => section.id === "dependents")!;
    expect(dependents.rows.map((row) => row.path)).toContain("src/routes/api.login.ts");
    const entrypoints = sections.find((section) => section.id === "entrypoints")!;
    expect(entrypoints.rows.map((row) => row.path)).toEqual(["src/routes/api.login.ts"]);
  });

  test("carries SQL resources, drift and exported signatures as click targets", () => {
    const sections = buildNodeDossier(COVERED, ["src/lib/auth.ts"]);
    const resources = sections.find((section) => section.id === "resources")!;
    expect(resources.rows[0]).toMatchObject({ path: "src/lib/auth.ts", line: 9 });

    const drift = sections.find((section) => section.id === "drift")!;
    expect(drift.rows[0]).toMatchObject({
      path: "src/lib/auth.ts",
      line: 9,
      label: "users.display_name",
    });

    const symbols = sections.find((section) => section.id === "symbols")!;
    expect(symbols.rows[0]).toMatchObject({
      path: "src/lib/auth.ts",
      line: 14,
      label: "verifySession",
    });
    expect(symbols.rows[0]!.detail).toContain("2 params");
  });

  test("returns nothing without an analysis or matching paths", () => {
    expect(buildNodeDossier(null, ["src/lib/auth.ts"])).toEqual([]);
    expect(buildNodeDossier(COVERED, ["src/unknown.ts"])).toEqual([]);
  });
});
