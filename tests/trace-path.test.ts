import { describe, expect, test } from "bun:test";
import { tracePath, type TraceGraph } from "../src/lib/analysis/trace";

type Edge = { path: string; line: number; typeOnly: boolean };

function graph(edges: Array<{ from: string; to: string; line?: number; typeOnly?: boolean }>) {
  const files = new Set<string>();
  const dependencies = new Map<string, Edge[]>();
  const dependents = new Map<string, Edge[]>();
  for (const edge of edges) {
    files.add(edge.from);
    files.add(edge.to);
    const outgoing = dependencies.get(edge.from) ?? [];
    outgoing.push({ path: edge.to, line: edge.line ?? 1, typeOnly: edge.typeOnly ?? false });
    dependencies.set(edge.from, outgoing);
    const incoming = dependents.get(edge.to) ?? [];
    incoming.push({ path: edge.from, line: edge.line ?? 1, typeOnly: edge.typeOnly ?? false });
    dependents.set(edge.to, incoming);
  }
  return {
    files: new Map([...files].map((path) => [path, {}])),
    dependencies,
    dependents,
  } as unknown as TraceGraph;
}

describe("tracePath", () => {
  test("walks a direct import chain in the forward direction", () => {
    const result = tracePath(
      graph([
        { from: "src/app.ts", to: "src/router.ts", line: 3 },
        { from: "src/router.ts", to: "src/routes/home.ts", line: 9 },
      ]),
      "src/app.ts",
      "src/routes/home.ts",
    );

    expect(result?.hops).toBe(2);
    expect(result?.path).toEqual(["src/app.ts", "src/router.ts", "src/routes/home.ts"]);
    expect(result?.steps.map((step) => step.direction)).toEqual(["imports", "imports"]);
    expect(result?.steps.map((step) => step.line)).toEqual([3, 9]);
  });

  test("finds a reverse chain and names the direction from the first file", () => {
    const result = tracePath(
      graph([
        { from: "src/routes/home.ts", to: "src/lib/auth.ts" },
        { from: "src/lib/auth.ts", to: "src/lib/session.ts" },
      ]),
      "src/lib/session.ts",
      "src/routes/home.ts",
    );

    expect(result?.path).toEqual(["src/lib/session.ts", "src/lib/auth.ts", "src/routes/home.ts"]);
    expect(result?.steps.map((step) => step.direction)).toEqual(["imported-by", "imported-by"]);
  });

  test("can mix directions in one shortest path", () => {
    const result = tracePath(
      graph([
        { from: "src/a.ts", to: "src/shared.ts" },
        { from: "src/b.ts", to: "src/shared.ts" },
      ]),
      "src/a.ts",
      "src/b.ts",
    );

    expect(result?.hops).toBe(2);
    expect(result?.steps.map((step) => step.direction)).toEqual(["imports", "imported-by"]);
    expect(result?.path).toEqual(["src/a.ts", "src/shared.ts", "src/b.ts"]);
  });

  test("preserves type-only edges as evidence", () => {
    const result = tracePath(
      graph([{ from: "src/types.ts", to: "src/contracts.ts", typeOnly: true }]),
      "src/types.ts",
      "src/contracts.ts",
    );

    expect(result?.steps[0]?.typeOnly).toBe(true);
  });

  test("returns the zero-hop path for the same file", () => {
    const result = tracePath(graph([{ from: "src/a.ts", to: "src/b.ts" }]), "src/a.ts", "src/a.ts");
    expect(result).toEqual({
      from: "src/a.ts",
      to: "src/a.ts",
      path: ["src/a.ts"],
      steps: [],
      hops: 0,
    });
  });

  test("returns null when no static chain connects the files", () => {
    expect(
      tracePath(
        graph([
          { from: "src/a.ts", to: "src/b.ts" },
          { from: "src/c.ts", to: "src/d.ts" },
        ]),
        "src/a.ts",
        "src/d.ts",
      ),
    ).toBeNull();
  });

  test("honours the hop cap instead of walking an unbounded graph", () => {
    const result = tracePath(
      graph([
        { from: "src/a.ts", to: "src/b.ts" },
        { from: "src/b.ts", to: "src/c.ts" },
      ]),
      "src/a.ts",
      "src/c.ts",
      1,
    );
    expect(result).toBeNull();
  });
});
