import { describe, expect, test } from "bun:test";
import { buildHierarchy, squarify } from "../src/lib/workspace/treemap";

const rect = { x: 10, y: 20, w: 400, h: 250 };
const items = [
  { id: "a", value: 60 },
  { id: "b", value: 30 },
  { id: "c", value: 20 },
  { id: "d", value: 10 },
  { id: "e", value: 5 },
  { id: "f", value: 5 },
];

describe("squarify", () => {
  test("empty and single", () => {
    expect(squarify([], rect)).toEqual([]);
    const one = squarify([{ id: "x", value: 3 }], rect);
    expect(one).toEqual([{ id: "x", ...rect }]);
  });

  test("stays inside bounds and preserves total area", () => {
    const placed = squarify(items, rect);
    expect(placed).toHaveLength(items.length);
    let total = 0;
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(rect.x - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(rect.y - 1e-6);
      expect(p.x + p.w).toBeLessThanOrEqual(rect.x + rect.w + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(rect.y + rect.h + 1e-6);
      total += p.w * p.h;
    }
    expect(total).toBeCloseTo(rect.w * rect.h, 3);
  });

  test("areas are proportional to values", () => {
    const placed = squarify(items, rect);
    const sum = items.reduce((s, i) => s + i.value, 0);
    for (const p of placed) {
      const value = items.find((i) => i.id === p.id)!.value;
      expect((p.w * p.h) / (rect.w * rect.h)).toBeCloseTo(value / sum, 3);
    }
  });

  test("is deterministic and ordered by value then input order", () => {
    const a = squarify(items, rect);
    expect(squarify(items, rect)).toEqual(a);
    expect(a.map((p) => p.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  test("clamps zero and negative values", () => {
    const placed = squarify(
      [
        { id: "z", value: 0 },
        { id: "n", value: -4 },
        { id: "p", value: 10 },
      ],
      rect,
    );
    expect(placed).toHaveLength(3);
    for (const p of placed) {
      expect(Number.isFinite(p.w * p.h)).toBe(true);
      expect(p.w).toBeGreaterThanOrEqual(0);
      expect(p.h).toBeGreaterThanOrEqual(0);
    }
    expect(placed.reduce((s, p) => s + p.w * p.h, 0)).toBeCloseTo(rect.w * rect.h, 3);
  });
});

describe("buildHierarchy", () => {
  const files = [
    { path: "src/lib/a.ts", loc: 10 },
    { path: "src/lib/b.ts", loc: 5 },
    { path: "src/ui/c.tsx", loc: 20 },
    { path: "README.md", loc: 3 },
    { path: "deep/only/one/f.ts", loc: 7 },
  ];
  const root = buildHierarchy(files);

  test("loc sums", () => {
    expect(root.loc).toBe(45);
    const src = root.children.find((c) => c.path === "src")!;
    expect(src.loc).toBe(35);
    expect(src.children.reduce((s, c) => s + c.loc, 0)).toBe(35);
  });

  test("single-child folders are merged", () => {
    const deep = root.children.find((c) => c.name === "deep/only/one")!;
    expect(deep.path).toBe("deep/only/one");
    expect(deep.children[0]!.path).toBe("deep/only/one/f.ts");
  });

  test("children sorted by size", () => {
    expect(root.children.map((c) => c.name)).toEqual(["src", "deep/only/one", "README.md"]);
  });
});
