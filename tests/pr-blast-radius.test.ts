import { describe, expect, test } from "bun:test";
import { computeDiffBlastRadius, formatBlastRadiusMarkdown } from "../src/lib/analysis/diff";
import type { AnalyzedFile, RepoAnalysis } from "../src/lib/analysis/types";

function file(
  path: string,
  options: {
    imports?: string[];
    role?: AnalyzedFile["role"];
    resources?: { id: string; line: number }[];
    services?: string[];
  } = {},
): AnalyzedFile {
  return {
    path,
    language: "ts",
    loc: 10,
    packageDir: "",
    role: options.role ?? "lib",
    imports: (options.imports ?? []).map((target, index) => ({
      specifier: `./${target.split("/").pop()}`,
      line: index + 2,
      kind: "internal" as const,
      target,
      typeOnly: false,
      dynamic: false,
    })),
    exports: [],
    functions: [],
    classes: [],
    envVars: [],
    services: options.services ?? [],
    resources: options.resources ?? [],
    endpoints: [],
  };
}

function analysis(files: AnalyzedFile[], cycles: string[][] = []): RepoAnalysis {
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
        uses: [
          { path: "src/lib/auth.ts", line: 4 },
          { path: "src/lib/session.ts", line: 8 },
        ],
      },
    ],
    envVars: [],
    cycles,
    stats: {
      treeFiles: files.length,
      sourceFiles: files.length,
      analyzedFiles: files.length,
      internalEdges: files.reduce((sum, item) => sum + item.imports.length, 0),
      externalPackages: 0,
      unresolvedImports: 0,
      skippedFiles: 0,
      loc: files.length * 10,
      durationMs: 1,
    },
    limitations: [],
  };
}

const FILLERS = Array.from({ length: 30 }, (_, index) => file(`src/unrelated/f${index}.ts`));

const COVERED = analysis(
  [
    file("src/lib/auth.ts", {
      resources: [{ id: "table:users", line: 4 }],
      services: ["github"],
    }),
    file("src/lib/session.ts", { imports: ["src/lib/auth.ts"] }),
    file("tests/auth.test.ts", { imports: ["src/lib/auth.ts"], role: "test" }),
    file("src/routes/api.login.ts", { imports: ["src/lib/session.ts"], role: "api" }),
    file("src/routes/index.tsx", { imports: ["src/lib/session.ts"], role: "route" }),
    ...FILLERS,
  ],
  [["src/lib/auth.ts", "src/lib/session.ts"]],
);

describe("computeDiffBlastRadius", () => {
  test("computes risk, direct and transitive dependents, entrypoints, tests and lineage", () => {
    const report = computeDiffBlastRadius(COVERED, ["./src/lib/auth.ts"]);

    expect(report.changed).toEqual(["src/lib/auth.ts"]);
    expect(report.known).toEqual(["src/lib/auth.ts"]);
    expect(report.unknown).toEqual([]);
    expect(report.risk).toBe("Medium");
    expect(report.direct.map((item) => item.path).sort()).toEqual([
      "src/lib/session.ts",
      "tests/auth.test.ts",
    ]);
    expect(report.entrypoints.map((item) => item.path).sort()).toEqual([
      "src/routes/api.login.ts",
      "src/routes/index.tsx",
    ]);
    expect(report.tests).toEqual(["tests/auth.test.ts"]);
    expect(report.coverageGap).toBe(false);
    expect(report.resources).toEqual([
      {
        id: "table:users",
        name: "users",
        kind: "table",
        definedIn: ["supabase/migrations/001.sql"],
        usedBy: 2,
      },
    ]);
    expect(report.services).toEqual(["github"]);
    expect(report.cycles).toEqual([
      { members: ["src/lib/auth.ts", "src/lib/session.ts"], touchesChange: true },
    ]);
  });

  test("reports unknown paths instead of inventing nodes", () => {
    const report = computeDiffBlastRadius(COVERED, ["docs/adr/0001.md"]);
    expect(report.known).toEqual([]);
    expect(report.unknown).toEqual(["docs/adr/0001.md"]);
    expect(report.risk).toBe("Low");
  });

  test("flags a High or Critical change with no covering tests", () => {
    const importers = Array.from({ length: 60 }, (_, index) =>
      file(`src/many/f${index}.ts`, { imports: ["src/lib/auth.ts"] }),
    );
    const report = computeDiffBlastRadius(analysis([file("src/lib/auth.ts"), ...importers]), [
      "src/lib/auth.ts",
    ]);

    expect(report.risk).toBe("Critical");
    expect(report.tests).toEqual([]);
    expect(report.coverageGap).toBe(true);
  });
});

describe("formatBlastRadiusMarkdown", () => {
  test("is deterministic and carries the stable upsert marker", () => {
    const report = computeDiffBlastRadius(COVERED, ["src/lib/auth.ts"]);
    const first = formatBlastRadiusMarkdown(report, {
      repository: "flawsom/nykst",
      pullNumber: 42,
    });
    const second = formatBlastRadiusMarkdown(report, {
      repository: "flawsom/nykst",
      pullNumber: 42,
    });

    expect(first).toBe(second);
    expect(first).toContain("<!-- nykst:blast-radius -->");
    expect(first).toContain("**Risk Medium**");
    expect(first).toContain("flawsom/nykst#42");
    expect(first).toContain("`src/lib/session.ts`");
    expect(first).toContain("`table:users`");
    expect(first).toContain("`tests/auth.test.ts`");
    expect(first).toContain("Touches this change");
    expect(first).not.toContain("\u2014");
  });

  test("prints a visible coverage warning for a critical uncovered change", () => {
    const importers = Array.from({ length: 60 }, (_, index) =>
      file(`src/many/f${index}.ts`, { imports: ["src/lib/auth.ts"] }),
    );
    const report = computeDiffBlastRadius(analysis([file("src/lib/auth.ts"), ...importers]), [
      "src/lib/auth.ts",
    ]);
    const markdown = formatBlastRadiusMarkdown(report);

    expect(markdown).toContain("> [!WARNING]");
    expect(markdown).toContain("Coverage gate");
    expect(markdown).toContain("**Risk Critical**");
  });
});
