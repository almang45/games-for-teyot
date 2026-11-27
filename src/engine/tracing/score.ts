import { FOLLOW_DEFAULTS } from './follow';
import { dist, pointAt, polyline, project, type Point, type Polyline } from './path';

/** Score mode thresholds (ARCHITECTURE.md §4.3). All lengths are in glyph heights (H). */
export interface ScoreParams {
  /** Corridor half-width `w`. */
  readonly corridor: number;
  /** The first touch must land this close to the stroke start. */
  readonly start: number;
  /** Least share of the path that must have the drawn line within `w`. */
  readonly coverage: number;
  /** Largest share of the drawn line that may be farther than `w` from the path. */
  readonly offPath: number;
  /** Largest drop in progress along the path, as a share of its length. */
  readonly backtrack: number;
  /** Direction is measured always, but only fails a stroke from T2 on. */
  readonly enforceDirection: boolean;
}

export const SCORE_DEFAULTS: ScoreParams = {
  corridor: FOLLOW_DEFAULTS.corridor,
  start: 0.15,
  coverage: 0.7,
  offPath: 0.35,
  backtrack: 0.1,
  enforceDirection: false,
};

/** §4.1: both lines are resampled to this many points, so the score doesn't depend on screen size. */
export const SAMPLES = 64;

/** Moving-average width for the drawn points (§4.2). Three keeps corners while it cuts jitter. */
export const SMOOTHING = 3;

export type ScoreCheck = 'too-short' | 'start' | 'coverage' | 'off-path' | 'direction';

export interface StrokeScore {
  readonly passed: boolean;
  /** The checks that failed, in the order of §4.3. Empty when the stroke passed. */
  readonly failed: readonly ScoreCheck[];
  /** Distance from the first touch to the stroke start. */
  readonly start: number;
  readonly coverage: number;
  readonly offPath: number;
  readonly backtrack: number;
}

/** `n` points spaced evenly by arc length, both ends included. */
export function resample(line: Polyline, n: number): Point[] {
  if (!Number.isInteger(n) || n < 2) throw new Error(`resample needs at least 2 points, got ${n}`);
  return Array.from({ length: n }, (_, i) => pointAt(line, (line.length * i) / (n - 1)));
}

/** Centered moving average over `width` points; the ends keep their own place. */
export function smooth(points: readonly Point[], width = SMOOTHING): Point[] {
  const half = Math.floor(width / 2);
  return points.map((p, i) => {
    if (i < half || i >= points.length - half) return p;
    let x = 0;
    let y = 0;
    for (let j = i - half; j <= i + half; j++) {
      const q = points[j] ?? p;
      x += q.x;
      y += q.y;
    }
    const count = 2 * half + 1;
    return { x: x / count, y: y / count };
  });
}

/**
 * Scores one finished stroke drawn in Score mode against its ideal path. `drawn` holds the raw
 * finger samples in glyph units, in the order they came.
 */
export function scoreStroke(
  path: Polyline,
  drawn: readonly Point[],
  params: ScoreParams = SCORE_DEFAULTS,
): StrokeScore {
  const first = drawn[0];
  const start = first ? dist(first, pointAt(path, 0)) : Number.POSITIVE_INFINITY;
  const line = drawnLine(drawn);
  if (!line) {
    return { passed: false, failed: ['too-short'], start, coverage: 0, offPath: 1, backtrack: 0 };
  }
  const user = resample(line, SAMPLES);
  const w = params.corridor;

  const covered = resample(path, SAMPLES).filter(
    (p) => project(line, p, 0, line.length).distance <= w,
  ).length;
  const coverage = covered / SAMPLES;
  const off = user.filter((p) => project(path, p, 0, path.length).distance > w).length;
  const offPath = off / SAMPLES;
  const backtrack = backwardTravel(path, user, w) / path.length;

  const failed: ScoreCheck[] = [];
  if (start > params.start) failed.push('start');
  if (coverage < params.coverage) failed.push('coverage');
  if (offPath > params.offPath) failed.push('off-path');
  if (params.enforceDirection && backtrack > params.backtrack) failed.push('direction');
  return { passed: failed.length === 0, failed, start, coverage, offPath, backtrack };
}

/** The smoothed drawn line, or undefined for a tap: it has no length to score. */
function drawnLine(drawn: readonly Point[]): Polyline | undefined {
  const points = smooth(drawn);
  const first = points[0];
  if (!first || points.every((p) => dist(p, first) <= 1e-9)) return undefined;
  return polyline(points);
}

/** How far along the path the tracker looks from where it is, each way. */
const TRACK_WINDOW = 0.25;

/**
 * The largest drop in progress along the path, counting only points near it. Progress is tracked
 * locally from point to point, so a stroke that crosses itself (8) or turns sharply (zigzag)
 * doesn't jump between its parts. A drop, not total backward travel, so jitter doesn't add up.
 * After an excursion off the path the finger may come back beyond the window, so the tracker
 * picks the path up again wherever the finger rejoins it. Only after it really left the path:
 * a finger that runs on past a stroke's end onto an earlier part of it (the 6 closing onto its
 * own stem) never left the corridor, and jumping back there would count as going backwards.
 */
function backwardTravel(path: Polyline, user: readonly Point[], w: number): number {
  const first = user[0];
  if (!first) return 0;
  const closed = dist(pointAt(path, 0), pointAt(path, path.length)) <= 1e-6;
  // `here` is on the path; `progress` keeps counting past the seam of a closed stroke.
  let here = project(path, first, 0, path.length).s;
  let progress = here;
  let best = progress;
  let drop = 0;
  let lost = false;
  for (const p of user.slice(1)) {
    const near = track(path, p, here, closed);
    let next = near;
    if (near.distance > w) {
      const anywhere = relock(path, p, here, closed);
      if (anywhere.distance > w) lost = true;
      if (anywhere.distance > w || !lost) continue;
      next = anywhere;
    }
    lost = false;
    progress += next.delta;
    here = next.s;
    best = Math.max(best, progress);
    drop = Math.max(drop, best - progress);
  }
  return drop;
}

/**
 * The nearest point on the whole path, for when the window lost it. On a closed stroke the
 * progress goes the short way round the seam, so a backwards circle still counts as backwards.
 */
function relock(
  path: Polyline,
  p: Point,
  here: number,
  closed: boolean,
): { s: number; delta: number; distance: number } {
  const { s, distance } = project(path, p, 0, path.length);
  let delta = s - here;
  if (closed && Math.abs(delta) > path.length / 2) delta -= Math.sign(delta) * path.length;
  return { s, delta, distance };
}

/** The nearest point within the window around `here`, wrapping round a closed stroke. */
function track(
  path: Polyline,
  p: Point,
  here: number,
  closed: boolean,
): { s: number; delta: number; distance: number } {
  const { length } = path;
  const windows: [number, number, number][] = [[here - TRACK_WINDOW, here + TRACK_WINDOW, 0]];
  if (closed && here - TRACK_WINDOW < 0)
    windows.push([length + here - TRACK_WINDOW, length, -length]);
  if (closed && here + TRACK_WINDOW > length)
    windows.push([0, here + TRACK_WINDOW - length, length]);
  let best = { s: here, delta: 0, distance: Number.POSITIVE_INFINITY };
  for (const [from, to, shift] of windows) {
    const hit = project(path, p, from, to);
    if (hit.distance < best.distance) {
      best = { s: hit.s, delta: hit.s + shift - here, distance: hit.distance };
    }
  }
  return best;
}
