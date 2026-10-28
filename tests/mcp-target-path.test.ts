import { describe, expect, test } from "bun:test";
import { runAnalysisTool } from "../src/lib/analysis/tools";
import type { AnalyzedFile, RepoAnalysis } from "../src/lib/analysis/types";

function file(path: string): AnalyzedFile {
  return {
    path,
    language: "ts",
    loc: 10,
    packageDir: "",
    role: "lib",
    imports: [],
    exports: [path.includes("graph") ? "graphThing" : "otherThing"],
    functions: [],
    classes: [],
    envVars: [],
    services: [],
    resources: [],
  };
}

const analysis: RepoAnalysis = {
  version: 2,
  generatedAt: "2026-01-01T00:00:00.000Z",
  method: "typescript-ast",
  ref: "test",
  packages: [],
  files: [file("src/lib/graph.ts"), file("src/lib/other.ts"), file("src/routes/graph.tsx")],
  services: [],
  resources: [],
  envVars: [],
  cycles: [],
  stats: {
    treeFiles: 3,
    sourceFiles: 3,
    analyzedFiles: 3,
    internalEdges: 0,
    externalPackages: 0,
    unresolvedImports: 0,
    skippedFiles: 0,
    loc: 30,
    durationMs: 1,
  },
  limitations: [],
};

const snapshot = {
  repository_full_name: "flawsom/fixture",
  created_at: "2026-01-01T00:00:00.000Z",
  analysis,
  history: undefined,
};

type SearchResult = {
  target_path: string | null;
  driver: string;
  results: { path: string }[];
  error?: string;
};

describe("search_files target path", () => {
  test("scopes hits to the stated directory and labels the driver", () => {
    const result = runAnalysisTool(snapshot, "search_files", {
      query: "graph",
      path: "src/lib",
    }) as SearchResult;
    expect(result.target_path).toBe("src/lib");
    expect(result.driver).toBe("target path and query text");
    expect(result.results.map((hit) => hit.path).sort()).toEqual(["src/lib/graph.ts"]);
  });

  test("the same query on a different path returns only that path", () => {
    const result = runAnalysisTool(snapshot, "search_files", {
      query: "graph",
      path: "src/routes",
    }) as SearchResult;
    expect(result.results.map((hit) => hit.path)).toEqual(["src/routes/graph.tsx"]);
  });

  test("an unknown target path errors instead of falling back to another path", () => {
    const result = runAnalysisTool(snapshot, "search_files", {
      query: "graph",
      path: "src/missing",
    }) as SearchResult;
    expect(result.results).toEqual([]);
    expect(result.driver).toBe("target path not found");
    expect(result.error).toContain("Target path not found");
  });

  test("without a path the driver is the query alone", () => {
    const result = runAnalysisTool(snapshot, "search_files", { query: "graph" }) as SearchResult;
    expect(result.target_path).toBeNull();
    expect(result.driver).toBe("query text only");
    expect(result.results.length).toBe(2);
  });
});
