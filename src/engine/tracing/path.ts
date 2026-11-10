/**
 * Stroke centerlines (ARCHITECTURE.md §4.1): an SVG path subset in the glyph's unit box, y down,
 * flattened into a polyline with cumulative arc length. Every distance is in glyph heights (H).
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Polyline {
  readonly points: readonly Point[];
  /** `cumulative[i]` is the arc length from `points[0]` to `points[i]`. */
  readonly cumulative: readonly number[];
  readonly length: number;
}

export interface Projection {
  /** Arc length of the nearest point. */
  readonly s: number;
  readonly distance: number;
}

/** Curves flatten to segments about this long: ~4 px on an 800 px glyph. */
const FLATTEN_STEP = 0.005;
/** Each command's points (as argument offsets): the controls, then the end point. */
const COMMANDS: Readonly<Record<string, readonly number[]>> = {
  M: [0],
  L: [0],
  Q: [0, 2],
  C: [0, 2, 4],
};

/** Parses one stroke (`M` then any `L`/`Q`/`C`, absolute only) into a polyline. */
export function parseStroke(d: string): Polyline {
  const tokens = d
    // Every letter but e, which belongs to numbers like 1e-3.
    .replaceAll(/[A-DF-Za-df-z]/g, (letter) => ` ${letter} `)
    .trim()
    .split(/[\s,]+/);
  const points: Point[] = [];
  let at = 0;
  let pen: Point | undefined;
  while (at < tokens.length) {
    const command = tokens[at] ?? '';
    const offsets = COMMANDS[command];
    if (!offsets) throw new Error(`unsupported path command "${command}" in "${d}"`);
    const arity = offsets.length * 2;
    const args = tokens.slice(at + 1, at + 1 + arity).map(Number);
    if (args.length < arity || args.some((n) => !Number.isFinite(n))) {
      throw new Error(`${command} needs ${arity} numbers in "${d}"`);
    }
    at += 1 + arity;
    const hull = offsets.map((i): Point => ({ x: args[i] ?? 0, y: args[i + 1] ?? 0 }));
    const end = hull.at(-1) ?? { x: 0, y: 0 };
    if (command === 'M') {
      if (pen) throw new Error(`a stroke is one line, so only its first command is M: "${d}"`);
      points.push(end);
    } else if (pen) {
      points.push(...flatten([pen, ...hull]));
    } else {
      throw new Error(`a stroke starts with M: "${d}"`);
    }
    pen = end;
  }
  return polyline(points);
}

/** Points after `hull[0]` along a line or Bézier curve with the given control hull. */
function flatten(hull: readonly Point[]): Point[] {
  let hullLength = 0;
  for (let i = 1; i < hull.length; i++) hullLength += dist(at(hull, i - 1), at(hull, i));
  const steps = hull.length === 2 ? 1 : Math.max(8, Math.ceil(hullLength / FLATTEN_STEP));
  const out: Point[] = [];
  for (let step = 1; step <= steps; step++) out.push(bezier(hull, step / steps));
  return out;
}

/** De Casteljau evaluation, so lines, quadratics and cubics share one code path. */
function bezier(hull: readonly Point[], t: number): Point {
  let level = [...hull];
  while (level.length > 1) {
    const next: Point[] = [];
    for (let i = 1; i < level.length; i++) next.push(lerp(at(level, i - 1), at(level, i), t));
    level = next;
  }
  return at(level, 0);
}

export function polyline(input: readonly Point[]): Polyline {
  const points: Point[] = [];
  for (const p of input) {
    const last = points.at(-1);
    if (!last || dist(last, p) > 1e-9) points.push(p);
  }
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push((cumulative[i - 1] ?? 0) + dist(at(points, i - 1), at(points, i)));
  }
  const length = cumulative.at(-1) ?? 0;
  if (length <= 0) throw new Error('a stroke needs a length');
  return { points, cumulative, length };
}

/** The point at arc length `s`, clamped to the stroke. */
export function pointAt(line: Polyline, s: number): Point {
  const clamped = Math.min(Math.max(s, 0), line.length);
  const i = segmentAt(line, clamped);
  const start = line.cumulative[i] ?? 0;
  const span = (line.cumulative[i + 1] ?? start) - start;
  return lerp(at(line.points, i), at(line.points, i + 1), span > 0 ? (clamped - start) / span : 0);
}

/** The nearest point to `p` on the part of the stroke between arc lengths `from` and `to`. */
export function project(line: Polyline, p: Point, from: number, to: number): Projection {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(line.length, Math.max(from, to));
  let best: Projection = { s: lo, distance: dist(p, pointAt(line, lo)) };
  for (let i = segmentAt(line, lo); i < line.points.length - 1; i++) {
    const start = line.cumulative[i] ?? 0;
    if (start > hi) break;
    const a = at(line.points, i);
    const b = at(line.points, i + 1);
    const span = (line.cumulative[i + 1] ?? start) - start;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (span * span);
    const s = Math.min(Math.max(start + t * span, lo, start), hi, start + span);
    const distance = dist(p, pointAt(line, s));
    if (distance < best.distance) best = { s, distance };
  }
  return best;
}

/** Points along the stroke from arc length `from` to `to`, both ends included. */
export function slice(line: Polyline, from: number, to: number): Point[] {
  const lo = Math.max(0, from);
  const hi = Math.min(line.length, to);
  if (hi <= lo) return [];
  const out = [pointAt(line, lo)];
  for (let i = 0; i < line.points.length; i++) {
    const s = line.cumulative[i] ?? 0;
    if (s > lo && s < hi) out.push(at(line.points, i));
  }
  out.push(pointAt(line, hi));
  return out;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Index of the segment holding arc length `s` (binary search over `cumulative`). */
function segmentAt(line: Polyline, s: number): number {
  let lo = 0;
  let hi = line.points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((line.cumulative[mid] ?? 0) <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Indexed access for loops whose bounds are already checked. */
function at(points: readonly Point[], i: number): Point {
  const p = points[i];
  if (!p) throw new Error(`no point ${i} of ${points.length}`);
  return p;
}
