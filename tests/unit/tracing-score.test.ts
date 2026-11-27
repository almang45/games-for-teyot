import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixturesFor, serialize, TARGETS } from '../../tools/strokes/fixtures';
import { TRACING } from '../../src/content/tracing';
import { directionEnforced, digitsUnlocked } from '../../src/engine/tracing/curriculum';
import { CORRIDOR_RANGE } from '../../src/engine/tracing/follow';
import { loadGlyph } from '../../src/engine/tracing/glyph';
import {
  FOLLOWS_BEFORE_SCORE,
  MISSES_BEFORE_FALLBACK,
  MOUSE_CORRIDOR,
  TracingItem,
  type ItemStep,
} from '../../src/engine/tracing/item';
import { parseStroke, pointAt, type Point } from '../../src/engine/tracing/path';
import {
  resample,
  SAMPLES,
  SCORE_DEFAULTS,
  scoreStroke,
  smooth,
} from '../../src/engine/tracing/score';
import {
  AdaptiveTolerance,
  effectiveCorridor,
  TOLERANCE_WINDOW,
  withScreenFloor,
} from '../../src/engine/tracing/tolerance';

const FIXTURES = 'tests/fixtures/strokes';

interface StrokeFixture {
  readonly glyph: string;
  readonly stroke: number;
  readonly kind: string;
  readonly note: string;
  readonly expected: { readonly T1: 'pass' | 'fail'; readonly T2: 'pass' | 'fail' };
  readonly points: readonly (readonly [number, number])[];
}

const glyphs = new Map(
  TRACING.flatMap((level) => level.glyphs).map((source) => [source.id, loadGlyph(source)]),
);
const line = (d: string) => parseStroke(d);
const along = (d: string, n: number, from = 0, to = 1): Point[] => {
  const path = line(d);
  return Array.from({ length: n }, (_, i) =>
    pointAt(path, path.length * (from + ((to - from) * i) / (n - 1))),
  );
};

describe('scoring a stroke (US-TRACE-03, ARCHITECTURE.md §4.3)', () => {
  const down = 'M 0.5 0 L 0.5 1';

  it('uses the age-3 thresholds', () => {
    expect(SCORE_DEFAULTS).toEqual({
      corridor: 0.12,
      start: 0.15,
      coverage: 0.7,
      offPath: 0.35,
      backtrack: 0.1,
      enforceDirection: false,
    });
  });

  it('resamples by arc length and smooths with a short moving average', () => {
    const points = resample(line('M 0 0 L 1 0 L 1 1'), 5);
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 0.5],
      [1, 1],
    ]);
    expect(() => resample(line(down), 1)).toThrow(/at least 2/);
    expect(
      smooth([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('passes a stroke drawn along the path, from either screen size', () => {
    const score = scoreStroke(line(down), along(down, 40));
    expect(score).toMatchObject({
      passed: true,
      failed: [],
      coverage: 1,
      offPath: 0,
      backtrack: 0,
    });
    // Fewer, sparser samples (a fast finger) score the same: both lines are resampled.
    expect(scoreStroke(line(down), along(down, 4)).passed).toBe(true);
  });

  it('fails each threshold on its own', () => {
    const path = line(down);
    const shifted = (dx: number, dy: number) =>
      along(down, 40).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    expect(scoreStroke(path, shifted(0, 0.2)).failed).toContain('start');
    expect(scoreStroke(path, along(down, 40, 0, 0.5)).failed).toEqual(['coverage']);
    const detour = [...along(down, 30), ...along('M 0.5 1 L 1 1 L 1 0.4', 30)];
    expect(scoreStroke(path, detour).failed).toEqual(['off-path']);
    expect(scoreStroke(path, shifted(0.13, 0)).failed).toEqual(['coverage', 'off-path']);
  });

  it('measures direction always, and fails on it only when the level enforces it', () => {
    const path = line(down);
    // Down and back up again: the right start, full coverage, but it drops all the way back.
    const back = [...along(down, 30), ...along(down, 30, 1, 0)];
    const loose = scoreStroke(path, back);
    expect(loose.passed).toBe(true);
    expect(loose.backtrack).toBeGreaterThan(0.9);
    const strict = { ...SCORE_DEFAULTS, enforceDirection: true };
    expect(scoreStroke(path, back, strict).failed).toEqual(['direction']);
    // A stroke that crosses itself, or ends where it starts, is not mistaken for going back.
    for (const id of ['digit.8', 'stroke.circle']) {
      const ring = glyphs.get(id)?.strokes[0];
      if (!ring) throw new Error(`${id} has no stroke`);
      const drawn = Array.from({ length: 120 }, (_, i) => pointAt(ring, (ring.length * i) / 119));
      expect(scoreStroke(ring, drawn, strict), id).toMatchObject({ passed: true, backtrack: 0 });
    }
    // A bulge off the path, back on it further down, to the end and back up: the tracker picks
    // the path up again where the finger rejoins it, so the way back still counts.
    const bulge = [
      ...along('M 0.5 0 L 0.65 0.05 L 0.65 0.4 L 0.5 0.45', 20),
      ...along('M 0.5 0.45 L 0.5 1', 20),
      ...along('M 0.5 1 L 0.5 0.45', 20),
    ];
    expect(scoreStroke(path, bulge, strict).failed).toEqual(['direction']);
    // The same on a closed stroke: a bulge, then round the circle the wrong way.
    const circle = glyphs.get('stroke.circle')?.strokes[0];
    if (!circle) throw new Error('stroke.circle has no stroke');
    const start = pointAt(circle, 0);
    const wrongWay = Array.from({ length: 80 }, (_, i) =>
      pointAt(circle, circle.length * (1 - (0.15 + (0.85 * i) / 79))),
    );
    const outward = { x: start.x + 0.2, y: start.y + 0.05 };
    const backwards = scoreStroke(circle, [start, outward, ...wrongWay], strict);
    expect(backwards.failed).toEqual(['direction']);
    // Running on past the end onto an earlier part of the stroke, without leaving the corridor,
    // is not going back: the 6 closes its loop and the finger slides on up its own stem.
    const six = glyphs.get('digit.6')?.strokes[0];
    if (!six) throw new Error('digit.6 has no stroke');
    const end = pointAt(six, six.length);
    const onTo = { x: 0.12, y: 0.75 };
    const overshoot = [
      ...Array.from({ length: 120 }, (_, i) => pointAt(six, (six.length * i) / 119)),
      ...Array.from({ length: 12 }, (_, i) => ({
        x: end.x + ((onTo.x - end.x) * (i + 1)) / 12,
        y: end.y + ((onTo.y - end.y) * (i + 1)) / 12,
      })),
    ];
    expect(scoreStroke(six, overshoot, strict)).toMatchObject({ passed: true, backtrack: 0 });
    expect(directionEnforced('T0')).toBe(false);
    expect(directionEnforced('T1')).toBe(false);
    expect(directionEnforced('T2')).toBe(true);
  });

  it('fails a tap and an empty stroke without throwing', () => {
    expect(scoreStroke(line(down), [{ x: 0.5, y: 0 }]).failed).toEqual(['too-short']);
    expect(scoreStroke(line(down), []).failed).toEqual(['too-short']);
  });

  it(`scores both lines on ${SAMPLES} points`, () => {
    expect(SAMPLES).toBe(64);
  });
});

describe('recorded attempts keep their verdicts (ARCHITECTURE.md §4.5)', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));

  it('has good, sloppy, reversed and scribble attempts', () => {
    const kinds = new Set(
      files.map((f) => (JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as StrokeFixture).kind),
    );
    expect([...kinds].sort()).toEqual(['good', 'reversed', 'scribble', 'sloppy']);
  });

  it('matches what tools/strokes/synthesize.ts writes, so the synthetic ones never drift', () => {
    const synthetic = files.filter((f) =>
      readFileSync(join(FIXTURES, f), 'utf8').includes('"source":"synthetic"'),
    );
    const built = new Map<string, string>();
    for (const { glyph, stroke } of TARGETS) {
      const path = glyphs.get(glyph)?.strokes[stroke];
      if (!path) throw new Error(`${glyph} has no stroke ${stroke}`);
      for (const [name, fixture] of fixturesFor(glyph, stroke, path))
        built.set(name, serialize(fixture));
    }
    expect(synthetic.sort()).toEqual([...built.keys()].sort());
    for (const [name, text] of built)
      expect(readFileSync(join(FIXTURES, name), 'utf8'), name).toBe(text);
  });

  it.each(files)('%s', (file) => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as StrokeFixture;
    const path = glyphs.get(fixture.glyph)?.strokes[fixture.stroke];
    if (!path) throw new Error(`${file}: no stroke ${fixture.stroke} in ${fixture.glyph}`);
    const points = fixture.points.map(([x, y]) => ({ x, y }));
    for (const [level, enforceDirection] of [
      ['T1', false],
      ['T2', true],
    ] as const) {
      const score = scoreStroke(path, points, { ...SCORE_DEFAULTS, enforceDirection });
      expect(
        { level, verdict: score.passed ? 'pass' : 'fail', failed: score.failed },
        fixture.note,
      ).toMatchObject({ level, verdict: fixture.expected[level] });
    }
  });
});

describe('tolerance adapts (US-TRACE-06, ARCHITECTURE.md §4.4)', () => {
  const run = (t: AdaptiveTolerance, results: readonly boolean[]) =>
    results.map((r) => t.record(r));

  it('tightens after 10 strokes above 85%, and loosens after 10 below 50%', () => {
    const t = new AdaptiveTolerance();
    const nine = run(t, Array<boolean>(TOLERANCE_WINDOW - 1).fill(true));
    expect(nine.every((c) => c === undefined)).toBe(true);
    expect(t.record(true)).toEqual({ from: 0.12, to: 0.11, direction: 'tighten', rate: 1 });
    expect(t.corridor).toBe(0.11);

    // The window starts over at the new width.
    expect(t.state.results).toEqual([]);
    const changes = run(t, [true, false, false, false, false, false, false, true, false, false]);
    expect(changes.at(-1)).toEqual({ from: 0.11, to: 0.12, direction: 'loosen', rate: 0.2 });
  });

  it('holds between 50% and 85%, sliding over the last 10 strokes', () => {
    const t = new AdaptiveTolerance();
    const changes = run(t, [false, false, true, true, true, true, true, true, true, true]);
    expect(changes.every((c) => c === undefined)).toBe(true);
    // The oldest miss slides out: 9 of 10 is above 85%.
    expect(t.record(true)).toMatchObject({ direction: 'tighten', rate: 0.9 });
  });

  it('stays inside 0.08–0.18 H', () => {
    const tight = new AdaptiveTolerance({ corridor: CORRIDOR_RANGE.min, results: [] });
    expect(run(tight, Array<boolean>(TOLERANCE_WINDOW).fill(true)).at(-1)).toBeUndefined();
    expect(tight.corridor).toBe(0.08);
    const loose = new AdaptiveTolerance({ corridor: 0.5, results: [] });
    expect(loose.corridor).toBe(CORRIDOR_RANGE.max);
    expect(() => new AdaptiveTolerance({ corridor: Number.NaN, results: [] })).toThrow(
      /not a number/,
    );
  });

  it('restores from what was stored, and lets a parent override the adaptive value', () => {
    const t = new AdaptiveTolerance({ corridor: 0.14, results: Array<boolean>(9).fill(false) });
    expect(t.record(false)).toMatchObject({ from: 0.14, to: 0.15, direction: 'loosen' });
    expect(effectiveCorridor(t.corridor, undefined)).toBe(0.15);
    expect(effectiveCorridor(t.corridor, 0.1)).toBe(0.1);
    expect(effectiveCorridor(t.corridor, 0.4)).toBe(CORRIDOR_RANGE.max);
    expect(() => effectiveCorridor(t.corridor, Number.NaN)).toThrow(/not a number/);
  });

  it('never lets the corridor get thinner on screen than the floor', () => {
    // A 300 px glyph on the phone: 0.08 H is 24 px, under a 36 px floor.
    expect(withScreenFloor(0.08, 300, 36)).toBeCloseTo(0.12, 9);
    expect(withScreenFloor(0.12, 800, 36)).toBe(0.12);
    expect(() => withScreenFloor(0.12, 0, 36)).toThrow(/positive/);
    expect(() => withScreenFloor(0.12, 300, Number.NaN)).toThrow(/≥ 0/);
  });
});

describe('one tracing item, from demo to done (US-TRACE-01..03)', () => {
  const steps = (item: TracingItem, events: Parameters<TracingItem['next']>[0][]): ItemStep[] =>
    events.map((e) => item.next(e));

  it('US-TRACE-01 starts with the whole demo, then Follow starts on its own', () => {
    const item = new TracingItem({ strokes: 2, followCompletions: 0, input: 'touch' });
    expect(item.step).toEqual({ kind: 'demo', stroke: 'all' });
    expect(item.next({ type: 'demo-done' })).toEqual({ kind: 'draw', stroke: 0, mode: 'follow' });
  });

  it('US-TRACE-02 follows each stroke in order, and counts the completion', () => {
    const item = new TracingItem({ strokes: 2, followCompletions: 1, input: 'touch' });
    const [, second, done] = steps(item, [
      { type: 'demo-done' },
      { type: 'stroke-done', passed: true },
      { type: 'stroke-done', passed: true },
    ]);
    expect(second).toEqual({ kind: 'draw', stroke: 1, mode: 'follow' });
    expect(done).toEqual({
      kind: 'done',
      result: {
        mode: 'follow',
        practice: false,
        strokes: [
          { misses: 0, fellBack: false },
          { misses: 0, fellBack: false },
        ],
        followCompletions: 2,
      },
    });
  });

  it(`US-TRACE-03 moves to Score mode after ${FOLLOWS_BEFORE_SCORE} Follow completions`, () => {
    const item = new TracingItem({ strokes: 1, followCompletions: 2, input: 'touch' });
    expect(item.mode).toBe('score');
    expect(item.next({ type: 'demo-done' })).toEqual({ kind: 'draw', stroke: 0, mode: 'score' });
    const done = item.next({ type: 'stroke-done', passed: true });
    expect(done).toMatchObject({ kind: 'done', result: { mode: 'score', followCompletions: 2 } });
  });

  it('US-TRACE-03 a miss fades, then the demo replays for that stroke only', () => {
    const item = new TracingItem({ strokes: 2, followCompletions: 2, input: 'touch' });
    expect(
      steps(item, [
        { type: 'demo-done' },
        { type: 'stroke-done', passed: true },
        { type: 'stroke-done', passed: false },
        { type: 'miss-done' },
        { type: 'demo-done' },
      ]),
    ).toEqual([
      { kind: 'draw', stroke: 0, mode: 'score' },
      { kind: 'draw', stroke: 1, mode: 'score' },
      { kind: 'miss', stroke: 1, fallback: false },
      { kind: 'demo', stroke: 1 },
      { kind: 'draw', stroke: 1, mode: 'score' },
    ]);
  });

  it(`US-TRACE-03 falls back to Follow for that stroke after ${MISSES_BEFORE_FALLBACK} misses in a row`, () => {
    const item = new TracingItem({ strokes: 2, followCompletions: 2, input: 'touch' });
    item.next({ type: 'demo-done' });
    const miss = [
      { type: 'stroke-done', passed: false },
      { type: 'miss-done' },
      { type: 'demo-done' },
    ] as const;
    const after = steps(item, [...miss, ...miss, ...miss]);
    expect(after[6]).toEqual({ kind: 'miss', stroke: 0, fallback: true });
    expect(after[8]).toEqual({ kind: 'draw', stroke: 0, mode: 'follow' });
    // The next stroke is scored again.
    expect(item.next({ type: 'stroke-done', passed: true })).toEqual({
      kind: 'draw',
      stroke: 1,
      mode: 'score',
    });
    const done = item.next({ type: 'stroke-done', passed: true });
    expect(done).toMatchObject({
      kind: 'done',
      result: {
        mode: 'score',
        strokes: [
          { misses: 3, fellBack: true },
          { misses: 0, fellBack: false },
        ],
      },
    });
  });

  it('US-LAPTOP-02 a mouse always follows, and the attempt is practice', () => {
    const item = new TracingItem({ strokes: 1, followCompletions: 5, input: 'mouse' });
    expect(item.mode).toBe('follow');
    expect(MOUSE_CORRIDOR).toBe(CORRIDOR_RANGE.max);
    item.next({ type: 'demo-done' });
    expect(item.next({ type: 'stroke-done', passed: true })).toMatchObject({
      kind: 'done',
      result: { practice: true, followCompletions: 5 },
    });
  });

  it('refuses events that do not end the current step', () => {
    const item = new TracingItem({ strokes: 1, followCompletions: 0, input: 'touch' });
    expect(() => item.next({ type: 'miss-done' })).toThrow(/does not end a demo step/);
    item.next({ type: 'demo-done' });
    expect(() => item.next({ type: 'stroke-done', passed: false })).toThrow(/cannot fail/);
    expect(() => new TracingItem({ strokes: 0, followCompletions: 0, input: 'touch' })).toThrow();
  });
});

describe('content and order (US-TRACE-04)', () => {
  it('offers the T0 strokes, then the digits 0–9, and every glyph loads', () => {
    expect(TRACING.map((l) => [l.level, l.glyphs.map((g) => g.id)])).toEqual([
      [
        'T0',
        [
          'stroke.vertical',
          'stroke.horizontal',
          'stroke.circle',
          'stroke.diagonal',
          'stroke.cross',
          'stroke.zigzag',
          'stroke.wave',
        ],
      ],
      ['T1', Array.from({ length: 10 }, (_, d) => `digit.${d}`)],
    ]);
    for (const level of TRACING)
      for (const g of level.glyphs) expect(() => loadGlyph(g)).not.toThrow();
  });

  it('starts the circle-like digits counterclockwise, from the top, like the circle stroke', () => {
    for (const id of ['stroke.circle', 'digit.0']) {
      const ring = glyphs.get(id)?.strokes[0];
      if (!ring) throw new Error(`${id} has no stroke`);
      const start = pointAt(ring, 0);
      const soon = pointAt(ring, 0.05);
      expect(start.y).toBeLessThan(0.1);
      expect(soon.x, `${id} heads left first`).toBeLessThan(start.x);
    }
  });

  it('unlocks the digits at 80% of T0 in box 3, or by a parent', () => {
    const ids = TRACING[0]?.glyphs.map((g) => g.id) ?? [];
    const boxes = (ready: number) => (id: string) => (ids.indexOf(id) < ready ? 3 : 1);
    // 5 of 7 is 71%, 6 of 7 is 86%.
    expect(digitsUnlocked(ids, boxes(5), false)).toBe(false);
    expect(digitsUnlocked(ids, boxes(6), false)).toBe(true);
    expect(digitsUnlocked(ids, () => 0, true)).toBe(true);
    expect(digitsUnlocked([], () => 3, false)).toBe(false);
  });
});
