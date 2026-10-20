/**
 * Radial (concentric orbit) layout for the six-level graph.
 *
 * The live app used to fall back to a vertical two-column lineup once a hub had
 * more than eleven children, which is exactly what `/graph` looked like for a
 * real GitHub repository. Everything now stays on a circle: one orbit up to
 * twelve siblings, two staggered orbits above that, and a third only for a hub
 * that is wider than a screen can read.
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
  radius: 340,
  innerRadius: 240,
  ringCapacity: 12,
} as const;

export const RADIAL_START_ANGLE = -Math.PI / 2;

/** Orbit sizes for a given number of siblings. */
/**
 * One orbit up to `singleRing`, then two concentric orbits up to `capacity`
 * siblings each. Wider hubs keep the two clean orbits and report the remainder,
 * because a third orbit would stack cards on top of each other.
 */
export function orbitPlan(
  count: number,
  ringCapacity: number = DEFAULTS.ringCapacity,
  singleRing = 8,
): { ring: 0 | 1 | 2; count: number; radiusFactor: number }[] {
  if (count <= 0) return [];
  const capacity = Math.max(4, ringCapacity);
  if (count <= singleRing) return [{ ring: 1, count, radiusFactor: 1 }];
  const inner = Math.min(capacity, Math.ceil(count / 2));
  return [
    { ring: 0, count: inner, radiusFactor: 0.58 },
    { ring: 1, count: Math.min(capacity, count - inner), radiusFactor: 1 },
  ];
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
  const maxRadius = Math.min(width / 2 - 70, height / 2 - 70);
  const plan = orbitPlan(count, capacity);
  const radius = Math.min(options.radius ?? DEFAULTS.radius, maxRadius);
  const innerRadius = Math.min(options.innerRadius ?? DEFAULTS.innerRadius, radius - 60);
  const cx = width / 2;
  const cy = height / 2;

  const points: RadialPoint[] = [];
  for (const orbit of plan) {
    const ringRadius = orbit.radiusFactor === 0.58 ? innerRadius : radius * orbit.radiusFactor;
    // Stagger the inner orbit by half a step so labels never line up radially.
    const offset = orbit.ring === 0 ? Math.PI / Math.max(orbit.count, 1) : 0;
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
