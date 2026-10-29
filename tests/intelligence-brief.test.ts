import { describe, expect, test } from "bun:test";
import { GROUNDED_BRIEF_MAX_CHARS, buildGroundedAiBrief } from "../src/lib/intelligence-core";
import type { AnalyzedFile, RepoAnalysis } from "../src/lib/analysis/types";
import type { RepositorySnapshot } from "../src/lib/repository-graph";

function file(
  path: string,
  options: {
    imports?: { target: string; specifier?: string }[];
    exports?: string[];
    symbols?: AnalyzedFile["symbols"];
    loc?: number;
  } = {},
): AnalyzedFile {
  return {
    path,
    language: "ts",
    loc: options.loc ?? 40,
    packageDir: "",
    role: "lib",
    imports: (options.imports ?? []).map((item, index) => ({
      specifier: item.specifier ?? `./${item.target.split("/").pop()}`,
      line: index + 3,
      kind: "internal" as const,
      target: item.target,
      typeOnly: false,
      dynamic: false,
    })),
    exports: options.exports ?? [],
    functions: [],
    classes: [],
    envVars: [],
    services: [],
    resources: [],
    ...(options.symbols ? { symbols: options.symbols } : {}),
  };
}

const ANALYSIS = {
  version: 2,
  generatedAt: "2026-10-23T13:41:34.416Z",
  method: "typescript-ast",
  ref: "self-snapshot",
  packages: [],
  files: [
    file("src/lib/loop.ts", {
      exports: ["extractGeneratedCode", "coveringTestCommand"],
      symbols: [
        { name: "extractGeneratedCode", kind: "function", line: 333 },
        { name: "coveringTestCommand", kind: "function", line: 349 },
      ],
    }),
    file("src/components/graph/SafeCodeLoopEngine.tsx", {
      imports: [{ target: "src/lib/loop.ts" }],
      exports: ["SafeCodeLoopEngine"],
      symbols: [{ name: "SafeCodeLoopEngine", kind: "function", line: 37 }],
    }),
    file("src/routes/intelligence.tsx", {
      imports: [{ target: "src/lib/intelligence-core.ts" }],
      exports: ["Route"],
    }),
    file("src/lib/intelligence-core.ts", {
      exports: ["buildGroundedAiBrief"],
      symbols: [{ name: "buildGroundedAiBrief", kind: "function", line: 245 }],
    }),
  ],
  services: [],
  resources: [],
  envVars: [],
  cycles: [],
  stats: {
    treeFiles: 265,
    sourceFiles: 209,
    analyzedFiles: 209,
    internalEdges: 455,
    externalPackages: 53,
    unresolvedImports: 0,
    skippedFiles: 2,
    loc: 38332,
    durationMs: 1311,
  },
  limitations: ["2 source file(s) were skipped because they exceed 400 KB."],
} as unknown as RepoAnalysis;

const SNAPSHOT = {
  repository: { full_name: "flawsom/nykst", default_branch: "main" },
  files: [{ path: "src/lib/loop.ts", type: "blob" }],
  analysis: ANALYSIS,
  history: {
    generatedAt: "2026-10-23T13:41:34.416Z",
    commits: [
      {
        sha: "e42b0971234567890",
        message: "docs: refresh the live audit for the grounded-loop release",
        author: "flawsom",
        date: "2026-10-23T13:47:00Z",
        files: ["README.md"],
      },
      {
        sha: "9c67fe30123456789",
        message: "feat(loop): grounded Stage 2 generation",
        author: "flawsom",
        date: "2026-10-23T13:42:00Z",
        files: ["src/lib/loop.ts"],
      },
    ],
    pullRequests: [
      {
        number: 42,
        title: "Grounded loop generation",
        author: "flawsom",
        state: "open",
        mergedAt: null,
        files: ["src/lib/loop.ts"],
        closes: [],
      },
    ],
    limitations: [],
  },
} as unknown as RepositorySnapshot;

const FOCUS = {
  name: "loop.ts",
  path: "src/lib/loop.ts",
  size: "14 KB",
  summary: "The four-stage loop model.",
  content: "export function extractGeneratedCode() {}",
};

describe("buildGroundedAiBrief", () => {
  test("carries real symbols, imports, importers and commit history", () => {
    const brief = buildGroundedAiBrief(
      SNAPSHOT,
      "Which files implement the safe coding loop?",
      FOCUS,
    );
    expect(brief).toContain("Repository: flawsom/nykst (default branch main)");
    expect(brief).toContain("209 analyzed source files");
    expect(brief).toContain("Focus artifact: src/lib/loop.ts");
    expect(brief).toContain("extractGeneratedCode (function, line 333)");
    expect(brief).toContain("Importers (1): src/components/graph/SafeCodeLoopEngine.tsx");
    expect(brief).toContain("9c67fe3");
    expect(brief).toContain("#42 [open] Grounded loop generation");
  });

  test("finds the files the question is about, by real path and export", () => {
    const brief = buildGroundedAiBrief(
      SNAPSHOT,
      "Which components render the safe coding loop?",
      FOCUS,
    );
    expect(brief).toContain(
      "src/components/graph/SafeCodeLoopEngine.tsx (40 LOC; exports SafeCodeLoopEngine; imports src/lib/loop.ts)",
    );
    expect(brief).not.toContain("src/routes/intelligence.tsx");
  });

  test("says what is missing instead of inventing evidence", () => {
    const brief = buildGroundedAiBrief(
      { repository: { full_name: "flawsom/nykst" }, files: [] } as RepositorySnapshot,
      "Which files import the loop?",
      FOCUS,
    );
    expect(brief).toContain("only a file list stored");
    expect(brief).toContain("per-symbol evidence is not applicable");
    expect(brief).not.toContain("Importers (");
    expect(brief.toLowerCase()).not.toContain("grounded in the latest repository snapshot");
  });

  test("stays inside the provider budget", () => {
    const brief = buildGroundedAiBrief(SNAPSHOT, "safe coding loop ".repeat(80), FOCUS);
    expect(brief.length).toBeLessThanOrEqual(GROUNDED_BRIEF_MAX_CHARS + 400);
  });
});
