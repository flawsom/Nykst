import { describe, expect, test } from "bun:test";
import {
  ORBIT_PAGE_SIZE,
  RADIAL_START_ANGLE,
  curvedEdgePath,
  isRadial,
  orbitCardSize,
  orbitPlan,
  radialLayout,
} from "../src/lib/graph-layout";

const W = 1200;
const H = 820;
const CX = W / 2;
const CY = H / 2;

describe("radialLayout", () => {
  test("places siblings on a full 360 degree ring, never a vertical column", () => {
    const points = radialLayout(6, { width: W, height: H });
    expect(points).toHaveLength(6);

    const xs = new Set(points.map((point) => Math.round(point.x)));
    const ys = new Set(points.map((point) => Math.round(point.y)));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);

    // First point sits at the top of the circle: angle = -90 degrees.
    const first = points[0]!;
    expect(first.angle).toBeCloseTo(RADIAL_START_ANGLE, 5);
    expect(first.x).toBeCloseTo(CX, 5);
    expect(first.y).toBeLessThan(CY);

    // Every point is the same distance from the hub, i.e. a true circle.
    const radii = points.map((point) => Math.hypot(point.x - CX, point.y - CY));
    for (const radius of radii) expect(radius).toBeCloseTo(radii[0]!, 4);
    expect(isRadial(points)).toBe(true);
  });

  test("uses two staggered concentric rings above eight siblings", () => {
    const points = radialLayout(14, { width: W, height: H });
    expect(points).toHaveLength(14);
    const rings = new Set(points.map((point) => point.ring));
    expect([...rings].sort()).toEqual([0, 1]);

    const inner = points.filter((point) => point.ring === 0);
    const outer = points.filter((point) => point.ring === 1);
    expect(inner).toHaveLength(7);
    expect(outer).toHaveLength(7);

    const distance = (point: { x: number; y: number }) => Math.hypot(point.x - CX, point.y - CY);
    expect(distance(inner[0]!)).toBeLessThan(distance(outer[0]!));

    // The rings are staggered, so no inner point shares an angle with an outer one.
    const innerAngles = new Set(inner.map((point) => point.angle.toFixed(3)));
    expect(outer.some((point) => innerAngles.has(point.angle.toFixed(3)))).toBe(false);

    // Still no two siblings stacked in one column.
    expect(new Set(points.map((point) => Math.round(point.x))).size).toBeGreaterThan(8);
    expect(isRadial(points)).toBe(true);
  });

  test("keeps every sibling inside the viewport for a very wide hub", () => {
    const points = radialLayout(30, { width: W, height: H });
    // A hub wider than one readable orbit keeps the two clean orbits and pages
    // the rest through the sector selector.
    expect(points).toHaveLength(ORBIT_PAGE_SIZE);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(W);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(H);
    }
    expect(new Set(points.map((point) => `${point.x.toFixed(2)}:${point.y.toFixed(2)}`)).size).toBe(
      ORBIT_PAGE_SIZE,
    );
  });

  test("orbitPlan is balanced and empty for no children", () => {
    expect(orbitPlan(0)).toEqual([]);
    expect(orbitPlan(8)).toEqual([{ ring: 1, count: 8, radiusFactor: 1 }]);
    const plan = orbitPlan(ORBIT_PAGE_SIZE);
    expect(plan.reduce((sum, orbit) => sum + orbit.count, 0)).toBe(ORBIT_PAGE_SIZE);
    expect(plan.map((orbit) => orbit.count)).toEqual([8, 8]);
    expect(orbitPlan(40).reduce((sum, orbit) => sum + orbit.count, 0)).toBe(ORBIT_PAGE_SIZE);
  });
});

describe("radial coordinate invariant", () => {
  const stdDev = (values: number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  };

  test("every sibling count spreads past 80px on both axes", () => {
    for (const count of [3, 6, 8, 13, ORBIT_PAGE_SIZE]) {
      const points = radialLayout(count, { width: W, height: H });
      expect(points.length).toBeGreaterThan(0);
      expect(stdDev(points.map((point) => point.x))).toBeGreaterThan(80);
      expect(stdDev(points.map((point) => point.y))).toBeGreaterThan(80);
    }
  });

  test("no two rendered cards overlap at any orbit size", () => {
    for (let count = 2; count <= ORBIT_PAGE_SIZE; count += 1) {
      const points = radialLayout(count, { width: W, height: H });
      const plan = orbitPlan(count);
      const counts = new Map<number, number>();
      for (const orbit of plan) counts.set(orbit.ring, orbit.count);
      const rects = points.map((point) => {
        const size = orbitCardSize(point.ring, counts.get(point.ring) ?? 0);
        return {
          left: point.x - size.width / 2,
          right: point.x + size.width / 2,
          top: point.y - size.height / 2,
          bottom: point.y + size.height / 2,
        };
      });
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]!;
          const b = rects[j]!;
          const overlaps =
            a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          expect({ count, i, j, overlaps }).toEqual({ count, i, j, overlaps: false });
        }
      }
    }
  });
});

describe("curvedEdgePath", () => {
  test("emits a quadratic bezier from the hub to the node", () => {
    const path = curvedEdgePath({ x: 600, y: 410 }, { x: 600, y: 70 });
    expect(path.startsWith("M 600 410 Q ")).toBe(true);
    expect(path.endsWith("600 70")).toBe(true);
    const [controlX, controlY] = path
      .replace("M 600 410 Q ", "")
      .split(" ")
      .slice(0, 2)
      .map(Number) as [number, number];
    // The control point is offset sideways, so the edge bows instead of overlapping.
    expect(controlX).not.toBe(600);
    expect(Number.isFinite(controlY)).toBe(true);
  });
});
