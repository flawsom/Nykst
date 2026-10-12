import { describe, expect, test } from "bun:test";
import { indexAnalysis } from "../src/lib/analysis/impact";
import {
  DATA_PATH,
  MAX_ORBIT_NODES,
  SERVICES_PATH,
  layoutOrbit,
  orbitNodes,
  topFiles,
} from "../src/lib/workspace/orbit";
import { analyzeFixture } from "./helpers";

const code = (n: number) => `export const v${n} = ${n};\n`;

async function fixture() {
  const analysis = await analyzeFixture({
    "src/lib/a.ts": code(1),
    "src/lib/b.ts": `import { v1 } from "./a";\nexport const b = v1;\n`,
    "src/lib/deep/c.ts": code(3),
    "src/components/ui.tsx": `import { b } from "../lib/b";\nexport const U = () => b;\n`,
    "src/components/pay.ts": `import Stripe from "stripe";\nexport const s = new Stripe("x");\n`,
    "index.ts": `import { U } from "./src/components/ui";\nexport { U };\n`,
  });
  return { analysis, index: indexAnalysis(analysis) };
}

describe("orbitNodes", () => {
  test("root shows src folders, loose files and services", async () => {
    const { analysis, index } = await fixture();
    const nodes = orbitNodes(analysis, index, "");
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId["src/lib"]?.files).toBe(3);
    expect(byId["src/components"]?.files).toBe(2);
    expect(byId["root-files"]?.files).toBe(1);
    expect(byId["src"]).toBeUndefined();
    expect(analysis.services.length).toBeGreaterThan(0);
    expect(byId["services"]?.kind).toBe("services");
    expect(byId["services"]?.files).toBe(1);
    expect(byId["data"]).toBeUndefined();
  });

  test("importers count distinct outside files", async () => {
    const { analysis, index } = await fixture();
    const byId = Object.fromEntries(orbitNodes(analysis, index, "").map((n) => [n.id, n]));
    // only src/components/ui.tsx imports into src/lib (a->b is internal)
    expect(byId["src/lib"]?.importers).toBe(1);
    expect(byId["src/components"]?.importers).toBe(1);
    expect(byId["root-files"]?.importers).toBe(0);
  });

  test("drilling into a folder lists its children", async () => {
    const { analysis, index } = await fixture();
    const nodes = orbitNodes(analysis, index, "src/lib");
    expect(nodes.map((n) => n.id).sort()).toEqual(["src/lib/a.ts", "src/lib/b.ts", "src/lib/deep"]);
    const a = nodes.find((n) => n.id === "src/lib/a.ts");
    expect(a?.kind).toBe("file");
    expect(a?.importers).toBe(1);
    expect(a?.drill).toBeNull();
    expect(orbitNodes(analysis, index, SERVICES_PATH).length).toBe(analysis.services.length);
    expect(orbitNodes(analysis, index, DATA_PATH)).toEqual([]);
  });

  test("caps at 10 with a +N more node", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i += 1) files[`pkg/f${i}.ts`] = code(i) + "\n".repeat(i);
    const analysis = await analyzeFixture(files);
    const index = indexAnalysis(analysis);
    const nodes = orbitNodes(analysis, index, "pkg");
    expect(nodes).toHaveLength(MAX_ORBIT_NODES);
    const more = nodes.at(-1)!;
    expect(more.kind).toBe("more");
    expect(more.hidden).toHaveLength(11);
    expect(more.label).toBe("+11 more");
  });

  test("topFiles ranks by importers", async () => {
    const { analysis, index } = await fixture();
    const lib = orbitNodes(analysis, index, "").find((n) => n.id === "src/lib")!;
    expect(topFiles(index, lib, 1)[0]?.path).toBe("src/lib/a.ts");
  });
});

describe("layoutOrbit", () => {
  test.each([1, 3, 8, 9, 10])("positions for %d are in range and unique", (count) => {
    const points = layoutOrbit(count, 900, 520);
    expect(points).toHaveLength(count);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(count);
  });

  test("starts at the top and is deterministic", () => {
    const a = layoutOrbit(5, 800, 500);
    expect(a[0]!.x).toBe(50);
    expect(a[0]!.y).toBeLessThan(50);
    expect(layoutOrbit(5, 800, 500)).toEqual(a);
    expect(layoutOrbit(0, 800, 500)).toEqual([]);
  });
});
