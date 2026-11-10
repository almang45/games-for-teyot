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

/**
 * Curves flatten to chords this long: a circle of radius 0.45 H then strays 0.0001 H (0.1 px) from
 * the true curve in about 140 points. Score mode (§4.3) resamples to its own fixed count instead.
 */
const FLATTEN_STEP = 0.02;
/** Each command's points (as argument offsets): the controls, then the end point. */
const COMMANDS: Readonly<Record<string, readonly number[]>> = {
  M: [0],
  L: [0],
  Q: [0, 2],
  C: [0, 2, 4],
};
/** A command letter, or a number; separators are optional where SVG allows (`M0.5-0.1`). */
const TOKEN = /[\s,]*(?:([A-Za-z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?))/y;

/**
 * Parses one stroke into a polyline: `M`, then `L`/`Q`/`C`, absolute only. As in SVG, a command's
 * arguments may repeat without the letter, and pairs after `M` are lines.
 */
export function parseStroke(d: string): Polyline {
  const tokens = tokenize(d);
  const points: Point[] = [];
  let command: string | undefined;
  let pen: Point | undefined;
  let at = 0;
  while (at < tokens.length) {
    const token = tokens[at];
    if (typeof token === 'string') {
      command = token;
      at += 1;
    }
    const offsets = command === undefined ? undefined : COMMANDS[command];
    if (!command || !offsets)
      throw new Error(`unsupported path command "${command ?? ''}" in "${d}"`);
    const arity = offsets.length * 2;
    const args = tokens.slice(at, at + arity);
    if (args.length < arity || !args.every((a): a is number => typeof a === 'number')) {
      throw new Error(`${command} needs ${arity} numbers in "${d}"`);
    }
    at += arity;
    const hull = offsets.map((i): Point => ({ x: args[i] ?? 0, y: args[i + 1] ?? 0 }));
    const end = hull.at(-1) ?? { x: 0, y: 0 };
    if (command === 'M') {
      if (pen) throw new Error(`a stroke is one line, so only its first command is M: "${d}"`);
      points.push(end);
      command = 'L';
    } else if (pen) {
      points.push(...flatten([pen, ...hull]));
    } else {
      throw new Error(`a stroke starts with M: "${d}"`);
    }
    pen = end;
  }
  if (!pen) throw new Error(`a stroke starts with M: "${d}"`);
  return polyline(points);
}

function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const scanner = new RegExp(TOKEN.source, 'y');
  while (scanner.lastIndex < d.length) {
    const at = scanner.lastIndex;
    if (d.slice(at).trim().replaceAll(',', '') === '') break;
    const match = scanner.exec(d);
    if (!match) throw new Error(`unexpected "${d.slice(at).trim()}" in "${d}"`);
    const [, letter, number] = match;
    tokens.push(letter ?? Number(number));
  }
  return tokens;
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

/** Index `i` of the segment from `points[i]` to `points[i + 1]` that holds arc length `s`. */
export function segmentAt(line: Polyline, s: number): number {
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
