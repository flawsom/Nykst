import { describe, expect, test } from "bun:test";
import { childrenOf, type GraphNode } from "../src/lib/graph-data";
import { buildRepositoryGraph, type RepositorySnapshot } from "../src/lib/repository-graph";

/**
 * Invariants of the real graph: every node comes from an ingered repository snapshot.
 * There is no generated fallback, so these assertions also guard against a sample
 * organization ever creeping back into the product.
 */

const PATHS = [
  "src/index.ts",
  "src/lib/index.ts", // same basename, different area — the case that used to collide
  "src/routes/index.tsx",
  "src/components/index.ts",
  "src/app.tsx",
  "src/lib/analysis/engine.server.ts",
  "src/lib/analysis/impact.ts",
  "src/routes/api.health.ts",
  "src/routes/graph.tsx",
  "supabase/migrations/20260101000000_init.sql",
  "tests/engine.test.ts",
  "docs/architecture.md",
  "package.json",
];

function snapshot(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    repository: { full_name: "acme/payments", default_branch: "main", html_url: "https://github.com/acme/payments" },
    files: PATHS.map((path, i) => ({ path, type: "blob", size: 100 + i })),
    commits: [],
    issues: [],
    pull_requests: [],
    ...overrides,
  } as RepositorySnapshot;
}

function walk(node: GraphNode, visit: (node: GraphNode, parent: GraphNode | null) => void) {
  visit(node, null);
  const step = (current: GraphNode) => {
    for (const child of childrenOf(current)) {
      visit(child, current);
      step(child);
    }
  };
  step(node);
}

describe("repository graph", () => {
  test("every node id is unique across the whole tree", () => {
    const root = buildRepositoryGraph(snapshot());
    const seen = new Set<string>();
    const duplicates: string[] = [];
    walk(root, (node) => {
      if (seen.has(node.id)) duplicates.push(node.id);
      seen.add(node.id);
    });
    expect(duplicates).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });

  test("nodes are real: each file is a leaf carrying its own repository path exactly once", () => {
    const root = buildRepositoryGraph(snapshot());
    const filePaths: string[] = [];
    walk(root, (node) => {
      if (node.kind === "file") {
        expect(node.expandable).toBe(false);
        expect(childrenOf(node)).toEqual([]);
        expect(node.detail?.path).toBeTruthy();
        expect(PATHS).toContain(node.detail!.path);
        filePaths.push(node.detail!.path);
      } else {
        expect(childrenOf(node).length).toBeGreaterThan(0);
      }
    });
    expect(filePaths.sort()).toEqual([...PATHS].sort());
    expect(new Set(filePaths).size).toBe(PATHS.length);
  });

  test("no sibling labels collide, so drill targets are deterministic", () => {
    const root = buildRepositoryGraph(snapshot());
    const collisions: string[] = [];
    walk(root, (node) => {
      const labels = childrenOf(node).map((child) => child.label);
      if (new Set(labels).size !== labels.length) collisions.push(node.id);
    });
    expect(collisions).toEqual([]);
  });

  test("the graph is derived from the snapshot, never seeded", () => {
    const a = buildRepositoryGraph(snapshot());
    const b = buildRepositoryGraph(snapshot({ repository: { full_name: "other/service" } }));
    expect(a.label).not.toBe(b.label);
    expect(a.id).toContain("acme/payments");
    expect(b.id).toContain("other/service");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("childrenOf reports emptiness instead of fabricating children", () => {
    const lone: GraphNode = {
      id: "x/file:only.ts",
      label: "only.ts",
      kind: "file",
      summary: "A leaf.",
      owners: [],
      dependencies: [],
      dependents: [],
      blast: { services: 0, modules: 0, files: 0, teams: 0, level: "Low" },
      expandable: false,
    };
    expect(childrenOf(lone)).toEqual([]);
  });
});
