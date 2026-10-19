import { describe, expect, test } from "bun:test";
import { runAnalysisTool, TOOLS } from "../src/lib/analysis/tools";
import type { AnalyzedFile, MemoryRecord, RepoAnalysis } from "../src/lib/analysis/types";

const file: AnalyzedFile = {
  path: "src/lib/auth.ts",
  language: "ts",
  loc: 12,
  packageDir: "",
  role: "lib",
  imports: [],
  exports: ["signIn"],
  functions: ["signIn"],
  classes: [],
  envVars: ["GITHUB_CLIENT_ID"],
  services: ["github"],
  resources: [],
  endpoints: [{ path: "/api/auth", line: 8, protocol: "http" }],
};

const memory: MemoryRecord[] = [
  {
    id: "adr:docs/adr/0001-auth.md",
    kind: "adr",
    title: "Authentication boundary",
    summary: "OAuth sessions stay server side.",
    text: "Status: Accepted",
    citations: [{ path: "docs/adr/0001-auth.md", line: 1 }],
    checksum: "abc",
    tags: ["adr", "accepted"],
    entities: [{ kind: "decision", value: "server side sessions" }],
    status: "accepted",
  },
];

const analysis: RepoAnalysis = {
  version: 2,
  generatedAt: "2026-01-01T00:00:00.000Z",
  method: "typescript-ast",
  ref: "test",
  packages: [],
  files: [file],
  services: [],
  resources: [],
  envVars: [{ name: "GITHUB_CLIENT_ID", files: [file.path] }],
  cycles: [],
  stats: {
    treeFiles: 1,
    sourceFiles: 1,
    analyzedFiles: 1,
    internalEdges: 0,
    externalPackages: 0,
    unresolvedImports: 0,
    skippedFiles: 0,
    loc: 12,
    durationMs: 1,
  },
  limitations: [],
  contracts: {
    openapi: [
      {
        source: "openapi.yaml",
        title: "API",
        version: "1",
        servers: [],
        operations: [
          {
            id: "GET /api/auth",
            source: "openapi.yaml",
            path: "/api/auth",
            method: "get",
            tags: [],
          },
        ],
      },
    ],
    grpc: [],
  },
  memory,
};

const snapshot = {
  repository_full_name: "flawsom/fixture",
  created_at: "2026-01-01T00:00:00.000Z",
  analysis,
  history: undefined,
};

describe("analysis tools", () => {
  test("every tool is read-only and the new surfaces are listed", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(names).toContain("search_memory");
    expect(names).toContain("get_federation");
    expect(names).toContain("get_trace_overlay");
    expect(names).toContain("simulate_change");
    expect(names).toContain("generate_fix_patch");
    for (const tool of TOOLS) expect(tool.annotations.readOnlyHint).toBe(true);
  });

  test("search_memory returns cited records and filters by kind", () => {
    const result = runAnalysisTool(snapshot, "search_memory", {
      query: "oauth",
      kind: "adr",
    }) as { total: number; results: { id: string; citations: { path: string }[] }[] };
    expect(result.total).toBe(1);
    expect(result.results[0]?.id).toBe("adr:docs/adr/0001-auth.md");
    expect(result.results[0]?.citations[0]?.path).toBe("docs/adr/0001-auth.md");

    const empty = runAnalysisTool(snapshot, "search_memory", {
      query: "oauth",
      kind: "migration",
    }) as { total: number };
    expect(empty.total).toBe(0);
  });

  test("get_architecture reports languages, contracts and memory counts", () => {
    const result = runAnalysisTool(snapshot, "get_architecture", {}) as {
      languages: Record<string, number>;
      contracts: { openapi: number; operations: number };
      memory: { records: number; by_kind: Record<string, number> };
    };
    expect(result.languages["ts"]).toBe(1);
    expect(result.contracts.openapi).toBe(1);
    expect(result.contracts.operations).toBe(1);
    expect(result.memory.records).toBe(1);
    expect(result.memory.by_kind["adr"]).toBe(1);
  });
});
