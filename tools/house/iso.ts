import type { Point } from '../../contracts/common.ts';
import { toScreen } from '../../src/engine/iso/projection.ts';

/** A plan point in metres; z is height above Lt Dasar's FFL. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Metres to canvas px: `scale` px per metre along an axis, `origin` where (0, 0, 0) lands. */
export interface Fit {
  readonly scale: number;
  readonly origin: Point;
}

/** The engine's 2:1 projection (src/engine/iso/projection.ts) with one metre as the tile. */
export function project(p: Vec3, fit: Fit): Point {
  const { x, y } = toScreen(p, {
    tileWidth: 2 * fit.scale,
    origin: { x: fit.origin[0], y: fit.origin[1] },
  });
  return [x, y];
}

/**
 * The smallest px-per-metre multiple that puts every corner of a `grid`-metre cell on a whole
 * pixel: a cell spans `grid · scale` px across and half that down.
 */
export function gridStep(grid: number): number {
  for (let n = 1; n <= 1000; n++) {
    const half = (n * grid) / 2;
    if (Math.abs(half - Math.round(half)) < 1e-9 && half >= 1) return n;
  }
  throw new RangeError(`no whole-pixel scale for a ${grid} m grid`);
}

/**
 * The largest px-per-metre scale, a multiple of `step`, that fits every point inside `size` minus
 * `margin`, centred. Whole numbers keep the blockout easy to measure for whoever paints over it.
 */
export function fitToCanvas(
  points: readonly Vec3[],
  size: readonly [number, number],
  margin: number,
  step = 1,
): Fit {
  const room: Point = [size[0] - 2 * margin, size[1] - 2 * margin];
  if (points.length === 0 || room[0] <= 0 || room[1] <= 0) {
    throw new RangeError('nothing to fit, or the margin leaves no room on the canvas');
  }
  const unit = points.map((p) => project(p, { scale: 1, origin: [0, 0] }));
  const xs = unit.map(([x]) => x);
  const ys = unit.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const fits = Math.min(room[0] / (spanX || 1), room[1] / (spanY || 1));
  const scale = Math.floor(fits / step) * step;
  if (scale < 1) throw new RangeError('the plan is too large for the canvas');
  return {
    scale,
    origin: [
      Math.round((size[0] - spanX * scale) / 2 - minX * scale),
      Math.round((size[1] - spanY * scale) / 2 - minY * scale),
    ],
  };
}

/** Andrew's monotone chain, counter-clockwise in screen space; drops collinear points. */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of pts) {
      while (out.length >= 2) {
        const a = out[out.length - 2];
        const b = out[out.length - 1];
        if (!a || !b || cross(a, b, p) > 0) break;
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
