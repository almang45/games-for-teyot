import type { Point, Polygon } from '../../../contracts/common.ts';
import { pointInPolygon } from '../../../contracts/geometry.ts';

/** Android's tablet breakpoint (sw600dp): a screen whose shorter side is under it is a phone. */
export const PHONE_MAX_SHORT_SIDE_DP = 600;

/** No tap area may be smaller than this on any device (PRD US-HOUSE-05), in dp. */
export const MIN_TAP_DP = 72;

/**
 * Whether the hub runs as on the phone (PRD US-HOUSE-05): opened zoomed to her room, with drag
 * and pinch. Sizes are CSS px, which on Android are dp.
 */
export function isPhone(widthDp: number, heightDp: number): boolean {
  return Math.min(widthDp, heightDp) < PHONE_MAX_SHORT_SIDE_DP;
}

/** Bisection steps for tapSize: under 0.1 px on a 1920 px frame. */
const TAP_SIZE_STEPS = 16;

/**
 * The side of the largest square centred on `centre` that fits inside `polygon`: the room's tap
 * area round the spot she taps. A square fits when its corners are inside and no polygon corner
 * pokes into it, which rules out notches of a non-convex room.
 */
export function tapSize(polygon: Polygon, centre: Point): number {
  const [cx, cy] = centre;
  const fits = (half: number): boolean => {
    const corners: Point[] = [
      [cx - half, cy - half],
      [cx + half, cy - half],
      [cx + half, cy + half],
      [cx - half, cy + half],
    ];
    if (!corners.every((p) => pointInPolygon(p, polygon))) return false;
    return !polygon.some(([x, y]) => Math.abs(x - cx) < half && Math.abs(y - cy) < half);
  };
  if (!pointInPolygon(centre, polygon)) return 0;
  const xs = polygon.map(([x]) => x);
  let lo = 0;
  let hi = Math.max(...xs) - Math.min(...xs);
  for (let i = 0; i < TAP_SIZE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid / 2)) lo = mid;
    else hi = mid;
  }
  return lo;
}
