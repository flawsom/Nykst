import { describe, expect, test } from "bun:test";
import {
  collectSensitiveNames,
  redactPublicAnalysis,
  redactPublicSnapshot,
  redactPublicValue,
} from "../src/lib/analysis/public";
import type { RepoAnalysis } from "../src/lib/analysis/types";
import type { RepositorySnapshot } from "../src/lib/repository-graph";

const analysis: RepoAnalysis = {
  version: 2,
  generatedAt: "2026-10-30T00:00:00.000Z",
  method: "typescript-ast",
  ref: "main",
  packages: [],
  files: [
    {
      path: "src/a.ts",
      language: "ts",
      loc: 1,
      packageDir: "",
      role: "lib",
      imports: [],
      exports: ["a"],
      functions: ["a"],
      classes: [],
      envVars: ["DATABASE_URL"],
      services: ["supabase"],
      resources: [{ id: "table:contact_messages", line: 4 }],
      columnRefs: [{ table: "contact_messages", column: "email", line: 5, operation: "select" }],
    },
  ],
  services: [
    {
      id: "supabase",
      name: "Supabase",
      category: "database",
      packages: ["@supabase/supabase-js"],
      envVars: ["SUPABASE_URL"],
      files: ["src/a.ts"],
      evidence: [{ path: "src/a.ts", reason: "import", line: 1 }],
    },
  ],
  resources: [
    {
      id: "table:contact_messages",
      kind: "table",
      name: "contact_messages",
      service: "supabase",
      definedIn: ["supabase/schema.sql"],
      uses: [{ path: "src/a.ts", line: 4 }],
      columns: [{ name: "email", type: "text", nullable: false }],
      columnDrift: [
        {
          kind: "unknown-column",
          table: "contact_messages",
          column: "email",
          message: "bad column",
          references: [{ path: "src/a.ts", line: 5, operation: "select" }],
        },
      ],
    },
  ],
  envVars: [{ name: "DATABASE_URL", files: ["src/a.ts"] }],
  cycles: [],
  stats: {
    treeFiles: 1,
    sourceFiles: 1,
    analyzedFiles: 1,
    internalEdges: 0,
    externalPackages: 1,
    unresolvedImports: 0,
    skippedFiles: 0,
    loc: 1,
    durationMs: 1,
  },
  limitations: [],
  memory: [
    {
      id: "migration:contact_messages",
      kind: "migration",
      title: "contact messages",
      summary: "a table",
      text: "create table contact_messages (email text);",
      citations: [{ path: "supabase/schema.sql", line: 1 }],
      checksum: "abc",
      tags: ["sql"],
      entities: [{ kind: "table", value: "contact_messages" }],
    },
  ],
  contracts: { openapi: [], grpc: [] },
  resolver: { aliases: [], manifests: [] },
};

describe("public analysis boundary", () => {
  test("removes environment names, table names, columns, contracts and raw evidence", () => {
    const safe = redactPublicAnalysis(analysis);
    const body = JSON.stringify(safe);

    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("SUPABASE_URL");
    expect(body).not.toContain("contact_messages");
    expect(body).not.toContain("create table");
    expect(body).not.toContain("email");
    expect(safe.envVars).toEqual([]);
    expect(safe.memory).toEqual([]);
    expect(safe.contracts).toBeUndefined();
    expect(safe.resolver).toBeUndefined();
    expect(safe.files[0]?.envVars).toEqual([]);
    expect(safe.files[0]?.resources).toEqual([{ id: "resource", line: 4 }]);
    expect(safe.files[0]?.columnRefs).toEqual([]);
    expect(safe.resources[0]?.name).toBe("Table 1");
    expect(safe.resources[0]?.columns).toEqual([]);
    expect(safe.resources[0]?.columnDrift).toEqual([]);
  });

  test("removes pull request bodies and extra knowledge from the public snapshot", () => {
    const snapshot = {
      repository: { full_name: "flawsom/nykst" },
      analysis,
      pull_requests: [{ title: "private PR" }],
      issues: [{ title: "private issue" }],
      contributors: [{ login: "private-person" }],
      history: {
        generatedAt: "2026-10-30T00:00:00.000Z",
        commits: [],
        pullRequests: [{ title: "private history PR" }],
        limitations: [],
      },
      knowledge: [{ text: "private evidence" }],
    } as unknown as RepositorySnapshot;

    const safe = redactPublicSnapshot(snapshot);
    const body = JSON.stringify(safe);
    expect(body).not.toContain("private PR");
    expect(body).not.toContain("private issue");
    expect(body).not.toContain("private-person");
    expect(body).not.toContain("private history PR");
    expect(body).not.toContain("private evidence");
    expect(safe.pull_requests).toEqual([]);
    expect(safe.issues).toEqual([]);
    expect(safe.contributors).toEqual([]);
    expect(safe.history?.pullRequests).toEqual([]);
    expect(safe.analysis?.envVars).toEqual([]);
  });

  test("redacts names inside tool output and strips content", () => {
    const names = collectSensitiveNames(analysis);
    const safe = redactPublicValue(
      {
        content: "export const secret = true;",
        envVars: ["DATABASE_URL"],
        resources: [
          {
            id: "table:contact_messages",
            kind: "table",
            name: "contact_messages",
            columns: [{ name: "email" }],
          },
        ],
        nested: { note: "contact_messages uses DATABASE_URL" },
      },
      names,
    );
    const body = JSON.stringify(safe);

    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("contact_messages");
    expect(body).not.toContain("export const secret");
    expect(body).toContain("Table 1");
    expect(body).toContain("[hidden]");
  });
});
