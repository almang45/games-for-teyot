// Synthetic Score mode attempts for tests/fixtures/strokes/ (ARCHITECTURE.md §4.5), until real
// ones recorded on the tablet replace them. Each is labelled with the verdict it is built to get,
// not with what the scorer says, so the fixtures guard the thresholds.
import { pointAt, type Point, type Polyline } from '../../src/engine/tracing/path.ts';

export type Verdict = 'pass' | 'fail';
export type Kind = 'good' | 'sloppy' | 'reversed' | 'scribble';

export interface Fixture {
  readonly glyph: string;
  readonly stroke: number;
  readonly kind: Kind;
  readonly source: 'synthetic';
  readonly note: string;
  /** Verdict without direction (T0, T1) and with it (T2 on). */
  readonly expected: { readonly T1: Verdict; readonly T2: Verdict };
  /** Glyph units: the unit box, y down. */
  readonly points: readonly (readonly [number, number])[];
}

/** mulberry32: a fixed seed per fixture keeps the files stable between runs. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Trace {
  /** Share of the path drawn, from `from` to `to`. Reversed when `to` < `from`. */
  readonly from: number;
  readonly to: number;
  /** Slow side-to-side drift, in H. */
  readonly wobble: number;
  /** Shift of the whole attempt, in H. */
  readonly shift: Point;
  readonly seed: number;
}

/** A finger following the path: a slow drift across it, a little jitter, 90 samples. */
function trace(path: Polyline, t: Trace): Point[] {
  const rnd = random(t.seed);
  const phase = rnd() * Math.PI * 2;
  const out: Point[] = [];
  const n = 90;
  for (let i = 0; i < n; i++) {
    const u = t.from + ((t.to - t.from) * i) / (n - 1);
    const s = u * path.length;
    const p = pointAt(path, s);
    const ahead = pointAt(path, Math.min(path.length, s + 0.01));
    const behind = pointAt(path, Math.max(0, s - 0.01));
    const dx = ahead.x - behind.x;
    const dy = ahead.y - behind.y;
    const len = Math.hypot(dx, dy) || 1;
    const drift = t.wobble * Math.sin(phase + u * Math.PI * 3);
    out.push({
      x: p.x + (-dy / len) * drift + t.shift.x + (rnd() - 0.5) * 0.008,
      y: p.y + (dx / len) * drift + t.shift.y + (rnd() - 0.5) * 0.008,
    });
  }
  return out;
}

/** Back-and-forth over the whole box, the way a child colours instead of tracing. */
function scribble(seed: number): Point[] {
  const rnd = random(seed);
  const out: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const a = { x: 0.1 + rnd() * 0.8, y: 0.1 + rnd() * 0.8 };
    const b = { x: 0.1 + rnd() * 0.8, y: 0.1 + rnd() * 0.8 };
    for (let k = 0; k < 8; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / 8, y: a.y + ((b.y - a.y) * k) / 8 });
  }
  return out;
}

const NONE: Point = { x: 0, y: 0 };

interface Spec {
  readonly name: string;
  readonly kind: Kind;
  readonly note: string;
  readonly expected: Fixture['expected'];
  readonly points: (path: Polyline) => Point[];
}

const pass = { T1: 'pass', T2: 'pass' } as const;
const fail = { T1: 'fail', T2: 'fail' } as const;

/** The same attempts for every glyph, so a threshold change shows up across shapes. */
const SPECS: readonly Spec[] = [
  {
    name: 'good',
    kind: 'good',
    note: 'close to the path, start to end',
    expected: pass,
    points: (p) => trace(p, { from: 0, to: 1, wobble: 0.03, shift: NONE, seed: 1 }),
  },
  {
    name: 'sloppy-pass',
    kind: 'sloppy',
    note: 'wanders and stops short, but stays mostly in the corridor',
    expected: pass,
    points: (p) =>
      trace(p, { from: 0.02, to: 0.85, wobble: 0.08, shift: { x: 0.03, y: 0.02 }, seed: 2 }),
  },
  {
    name: 'sloppy-wide',
    kind: 'sloppy',
    note: 'the right shape, but too far off the path',
    expected: fail,
    points: (p) => trace(p, { from: 0, to: 1, wobble: 0.22, shift: NONE, seed: 3 }),
  },
  {
    name: 'sloppy-short',
    kind: 'sloppy',
    note: 'gives up before half the stroke',
    expected: fail,
    points: (p) => trace(p, { from: 0, to: 0.45, wobble: 0.02, shift: NONE, seed: 4 }),
  },
  {
    name: 'sloppy-late-start',
    kind: 'sloppy',
    note: 'starts a third of the way in',
    expected: fail,
    points: (p) => trace(p, { from: 0.35, to: 1, wobble: 0.02, shift: NONE, seed: 5 }),
  },
  {
    name: 'scribble',
    kind: 'scribble',
    note: 'scribbles over the box',
    expected: fail,
    points: () => scribble(6),
  },
];

/** Reversed: an open stroke starts at the wrong end; a closed one only goes the wrong way round. */
function reversed(closed: boolean): Spec {
  return {
    name: 'reversed',
    kind: 'reversed',
    note: closed ? 'right start, wrong way round' : 'drawn from the wrong end',
    expected: closed ? { T1: 'pass', T2: 'fail' } : fail,
    points: (p) => trace(p, { from: 1, to: 0, wobble: 0.03, shift: NONE, seed: 7 }),
  };
}

export const TARGETS: readonly { glyph: string; stroke: number }[] = [
  { glyph: 'stroke.vertical', stroke: 0 },
  { glyph: 'stroke.circle', stroke: 0 },
  { glyph: 'stroke.zigzag', stroke: 0 },
  { glyph: 'stroke.wave', stroke: 0 },
  { glyph: 'digit.0', stroke: 0 },
  { glyph: 'digit.2', stroke: 0 },
  { glyph: 'digit.4', stroke: 1 },
];

/** Every attempt for one stroke, keyed by its file name. */
export function fixturesFor(glyph: string, stroke: number, path: Polyline): Map<string, Fixture> {
  const first = pointAt(path, 0);
  const last = pointAt(path, path.length);
  const closed = Math.hypot(first.x - last.x, first.y - last.y) < 1e-6;
  const out = new Map<string, Fixture>();
  for (const spec of [...SPECS, reversed(closed)]) {
    out.set(`${glyph}.${stroke}.${spec.name}.json`, {
      glyph,
      stroke,
      kind: spec.kind,
      source: 'synthetic',
      note: spec.note,
      expected: spec.expected,
      points: spec.points(path).map((q) => [round(q.x), round(q.y)] as const),
    });
  }
  return out;
}

/** One attempt per line: the format the parent area's export will use too. */
export function serialize(fixture: Fixture): string {
  return `${JSON.stringify(fixture)}\n`;
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
