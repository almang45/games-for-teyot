import type { Point, Polygon } from './common.ts';

/** Points closer than this to an edge count as on it: hand-placed JSON coordinates are integers. */
const EDGE_TOLERANCE = 0.5;

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const edges = (poly: Polygon): [Point, Point][] =>
  poly.map((p, i) => [p, poly[(i + 1) % poly.length] ?? p]);

/** Inside or on the boundary (even-odd rule). */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  const pairs = edges(poly);
  if (pairs.some(([a, b]) => distanceToSegment(p, a, b) <= EDGE_TOLERANCE)) return true;
  const [x, y] = p;
  let inside = false;
  for (const [[ax, ay], [bx, by]] of pairs) {
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Shoelace area; 0 for degenerate polygons. */
export function polygonArea(poly: Polygon): number {
  const twice = edges(poly).reduce((sum, [[ax, ay], [bx, by]]) => sum + ax * by - bx * ay, 0);
  return Math.abs(twice) / 2;
}

/** True when two non-adjacent edges cross, so the polygon is not simple. */
export function selfIntersects(poly: Polygon): boolean {
  const pairs = edges(poly);
  const n = pairs.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const a = pairs[i];
      const b = pairs[j];
      if (!adjacent && a && b && segmentsCross(a[0], a[1], b[0], b[1])) return true;
    }
  }
  return false;
}

const orientation = ([ax, ay]: Point, [bx, by]: Point, [cx, cy]: Point): number =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/** Samples a segment every `step` px, endpoints included. */
export function sampleSegment([ax, ay]: Point, [bx, by]: Point, step: number): Point[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
  return Array.from({ length: steps + 1 }, (_, i): Point => {
    const t = i / steps;
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  });
}
