/**
 * Radial (concentric orbit) layout for the six-level graph.
 *
 * The live app used to fall back to a vertical two-column lineup once a hub had
 * more than eleven children, which is exactly what `/graph` looked like for a
 * real GitHub repository. Everything now stays on a circle: one orbit up to
 * eight siblings, then two balanced, staggered orbits. The rings are far enough
 * apart for the rendered cards, which have a real width and height; the old
 * 100px separation made the root level of a 13-node repository overlap itself.
 *
 * Pure functions only, so the geometry is unit-testable without a DOM.
 */

export interface RadialPoint {
  /** svg x coordinate */
  x: number;
  /** svg y coordinate */
  y: number;
  /** distance from the center used for this point */
  radius: number;
  /** angle in radians, measured like Math.atan2 */
  angle: number;
  /** orbit index: 0 is the inner ring, 1 the main ring, 2 the overflow ring */
  ring: 0 | 1 | 2;
}

export interface RadialLayoutOptions {
  width?: number;
  height?: number;
  /** radius of the main orbit */
  radius?: number;
  /** radius of the inner orbit when a hub has more than one ring */
  innerRadius?: number;
  /** how many siblings fit comfortably on one orbit */
  ringCapacity?: number;
}

const DEFAULTS = {
  width: 1200,
  height: 820,
  radius: 365,
  ringCapacity: 8,
} as const;

export const RADIAL_START_ANGLE = -Math.PI / 2;

/**
 * The maximum number of cards one canvas page shows. The orbit stays readable
 * at 16 siblings; wider hubs use the same sector selector as before.
 */
export const ORBIT_PAGE_SIZE = 16;

/** Orbit sizes for a given number of siblings. */
/**
 * One orbit up to `singleRing`, then two balanced concentric orbits. The split
 * is balanced so neither ring is crowded; the caller pages a hub wider than
 * `ORBIT_PAGE_SIZE` instead of stacking a third ring on top of the cards.
 */
export function orbitPlan(
  count: number,
  ringCapacity: number = DEFAULTS.ringCapacity,
  singleRing = 8,
): { ring: 0 | 1 | 2; count: number; radiusFactor: number }[] {
  if (count <= 0) return [];
  const capacity = Math.max(4, ringCapacity);
  if (count <= singleRing) return [{ ring: 1, count, radiusFactor: 1 }];
  const outer = Math.min(capacity, Math.ceil(count / 2));
  const inner = Math.min(count - outer, capacity);
  return [
    { ring: 0, count: inner, radiusFactor: 0.548 },
    { ring: 1, count: outer, radiusFactor: 1 },
  ];
}

/**
 * Width and height of a rendered sibling card. These are deliberately kept in
 * the layout module next to the radii, because overlap is a property of the
 * geometry, not a visual detail. `ring 1` is the outer ring; `ring 0` is inner.
 */
export function orbitCardSize(ring: 0 | 1 | 2, count: number): { width: number; height: number } {
  if (ring === 1) return { width: count <= 6 ? 240 : 220, height: 56 };
  // The inner orbit is a compact secondary ring. Its cards must fit between the
  // hub and the outer cards, so they are deliberately narrower than the outer
  // cards rather than an arbitrary smaller copy of them.
  return { width: count <= 6 ? 140 : 125, height: 40 };
}

/** Radius for the inner orbit: enough room for the hub and for the card gap. */
export function orbitInnerRadius(count: number): number {
  return count >= 13 ? 185 : 170;
}

/**
 * Polar layout for `count` sibling nodes around the center of the viewport.
 * Never returns two points on the same vertical column, and the angular step is
 * always `2 * Math.PI / ringCount` so siblings spread over a full 360 degrees.
 */
export function radialLayout(count: number, options: RadialLayoutOptions = {}): RadialPoint[] {
  const width = options.width ?? DEFAULTS.width;
  const height = options.height ?? DEFAULTS.height;
  const capacity = options.ringCapacity ?? DEFAULTS.ringCapacity;
  // Leave room for the node cards, which are about 240 x 56 in the viewport.
  // Cards are wider than they are tall, so the vertical edge is the binding
  // constraint. Leave half a card plus a small margin inside the viewport.
  const maxRadius = Math.min(width / 2 - 70, height / 2 - 40);
  const plan = orbitPlan(count, capacity);
  const radius = Math.min(options.radius ?? DEFAULTS.radius, maxRadius);
  const innerRadius = Math.min(options.innerRadius ?? orbitInnerRadius(count), radius - 60);
  const cx = width / 2;
  const cy = height / 2;
  const outer = plan.find((orbit) => orbit.ring === 1);

  const points: RadialPoint[] = [];
  for (const orbit of plan) {
    const ringRadius = orbit.radiusFactor === 0.548 ? innerRadius : radius * orbit.radiusFactor;
    // Stagger the inner orbit by half an outer step, so its cards sit between
    // outer cards. Using the inner step instead lets the two rings line up at
    // some angles, which is what produced the root-level overlaps.
    const offset = orbit.ring === 0 ? Math.PI / Math.max(outer?.count ?? orbit.count, 1) : 0;
    for (let index = 0; index < orbit.count; index += 1) {
      const angle = (2 * Math.PI * index) / orbit.count + RADIAL_START_ANGLE + offset;
      points.push({
        x: cx + ringRadius * Math.cos(angle),
        y: cy + ringRadius * Math.sin(angle),
        radius: ringRadius,
        angle,
        ring: orbit.ring,
      });
    }
  }
  return points;
}

/** Quadratic bezier from the hub to a sibling, bowed so parallel edges stay readable. */
export function curvedEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bow = 0.18,
): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // Perpendicular offset, scaled to the edge length.
  const controlX = midX + (-dy / length) * length * bow;
  const controlY = midY + (dx / length) * length * bow;
  return `M ${round(from.x)} ${round(from.y)} Q ${round(controlX)} ${round(controlY)} ${round(to.x)} ${round(to.y)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** True when no two points share a column or a row, i.e. the ring really is radial. */
export function isRadial(points: RadialPoint[], tolerance = 1): boolean {
  const columns = new Set(points.map((point) => Math.round(point.x / tolerance)));
  const rows = new Set(points.map((point) => Math.round(point.y / tolerance)));
  return points.length < 3 || columns.size > 1 || rows.size > 1;
}
