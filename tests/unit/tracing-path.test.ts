import { describe, expect, it } from 'vitest';
import {
  dist,
  parseStroke,
  pointAt,
  polyline,
  project,
  slice,
} from '../../src/engine/tracing/path';
import { loadGlyph } from '../../src/engine/tracing/glyph';
import circle from '../../src/content/glyphs/stroke.circle.json';
import one from '../../src/content/glyphs/digit.1.json';
import vertical from '../../src/content/glyphs/stroke.vertical.json';

describe('stroke paths (ARCHITECTURE.md §4.1)', () => {
  it('parses lines into a polyline with arc length', () => {
    const line = parseStroke('M 0.3 0.25 L 0.6 0 L 0.6 1');
    expect(line.points).toEqual([
      { x: 0.3, y: 0.25 },
      { x: 0.6, y: 0 },
      { x: 0.6, y: 1 },
    ]);
    expect(line.length).toBeCloseTo(Math.hypot(0.3, 0.25) + 1, 9);
    expect(line.cumulative[1]).toBeCloseTo(Math.hypot(0.3, 0.25), 9);
  });

  it('accepts commas, missing spaces and exponents', () => {
    const line = parseStroke('M0,0L1e-1,0L0.1,5e-1');
    expect(line.points.at(-1)).toEqual({ x: 0.1, y: 0.5 });
  });

  it('flattens cubic and quadratic curves through their end points', () => {
    const quarter = parseStroke('M 1 0.5 C 1 0.776 0.776 1 0.5 1');
    expect(quarter.points.at(-1)).toEqual({ x: 0.5, y: 1 });
    // A quarter circle of radius 0.5 is π/4 long; a cubic is within 0.1% of it.
    expect(quarter.length).toBeCloseTo(Math.PI / 4, 3);
    for (const p of quarter.points) expect(dist(p, { x: 0.5, y: 0.5 })).toBeCloseTo(0.5, 3);

    const bend = parseStroke('M 0 0 Q 0.5 1 1 0');
    expect(bend.points.length).toBeGreaterThan(8);
    expect(pointAt(bend, bend.length / 2).y).toBeCloseTo(0.5, 2);
  });

  it.each([
    ['', 'unsupported path command ""'],
    ['L 0 0 L 1 1', 'a stroke starts with M'],
    ['M 0 0 L 1 1 M 0 1 L 1 0', 'only its first command is M'],
    ['M 0 0 l 1 1', 'unsupported path command "l"'],
    ['M 0 0 A 1 1 0 0 1 1 1', 'unsupported path command "A"'],
    ['M 0 0 L 1', 'L needs 2 numbers'],
    ['M 0 0 C 1 1 x 1 1 1', 'C needs 6 numbers'],
    ['M 0.5 0.5', 'a stroke needs a length'],
    ['M 0.5 0.5 L 0.5 0.5', 'a stroke needs a length'],
  ])('rejects %j', (d, message) => {
    expect(() => parseStroke(d)).toThrow(message);
  });

  it('drops repeated points, so no segment has zero length', () => {
    const line = polyline([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(line.points).toHaveLength(2);
  });

  it('finds points by arc length, clamped to the stroke', () => {
    const line = parseStroke('M 0 0 L 1 0 L 1 1');
    expect(pointAt(line, 0.5)).toEqual({ x: 0.5, y: 0 });
    expect(pointAt(line, 1.5)).toEqual({ x: 1, y: 0.5 });
    expect(pointAt(line, -1)).toEqual({ x: 0, y: 0 });
    expect(pointAt(line, 9)).toEqual({ x: 1, y: 1 });
  });

  it('projects onto only the window it is given', () => {
    const line = parseStroke('M 0 0 L 1 0 L 1 1');
    expect(project(line, { x: 0.4, y: 0.1 }, 0, 2)).toEqual({ s: 0.4, distance: 0.1 });
    // The window ends at s = 0.2, so the nearest allowed point is its end.
    const clamped = project(line, { x: 0.4, y: 0 }, 0, 0.2);
    expect(clamped.s).toBeCloseTo(0.2, 9);
    expect(clamped.distance).toBeCloseTo(0.2, 9);
    // Reversed bounds are the same window.
    expect(project(line, { x: 1.1, y: 0.5 }, 2, 1).s).toBeCloseTo(1.5, 9);
  });

  it('keeps a closed stroke from jumping to its end', () => {
    const ring = loadGlyph(circle).strokes[0];
    if (!ring) throw new Error('circle has no stroke');
    const start = ring.points[0];
    if (!start) throw new Error('circle has no points');
    expect(project(ring, start, 0, 0.25).s).toBe(0);
    expect(project(ring, start, 0, ring.length).s).toBe(0);
    expect(project(ring, start, ring.length - 0.25, ring.length).s).toBeCloseTo(ring.length, 9);
  });

  it('slices the stroke between two arc lengths', () => {
    const line = parseStroke('M 0 0 L 1 0 L 1 1');
    expect(slice(line, 0.5, 1.5)).toEqual([
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.5 },
    ]);
    expect(slice(line, 1, 1)).toEqual([]);
    expect(slice(line, -1, 9)).toEqual([...line.points]);
  });
});

describe('glyph files', () => {
  it.each([vertical, circle, one])('$id loads', (source) => {
    const glyph = loadGlyph(source);
    expect(glyph.strokes.length).toBeGreaterThan(0);
  });

  it('draws the circle counterclockwise from the top, like the c family', () => {
    const ring = loadGlyph(circle).strokes[0];
    if (!ring) throw new Error('circle has no stroke');
    expect(pointAt(ring, 0)).toEqual({ x: 0.5, y: 0.05 });
    expect(pointAt(ring, ring.length / 4).x).toBeCloseTo(0.05, 2);
    expect(ring.length).toBeCloseTo(Math.PI * 0.9, 2);
  });

  it.each([
    [{ id: '', metrics: 'stroke', strokes: [{ path: 'M 0 0 L 1 1' }] }, 'a glyph needs an id'],
    [{ id: 'x', metrics: 'serif', strokes: [{ path: 'M 0 0 L 1 1' }] }, 'unknown metrics "serif"'],
    [{ id: 'x', metrics: 'digit', strokes: [] }, 'glyph x: no strokes'],
    [
      { id: 'x', metrics: 'digit', strokes: [{ path: 'M 0 0 L 1 1' }, { path: 'M 0 0' }] },
      'glyph x stroke 2: a stroke needs a length',
    ],
    [
      { id: 'x', metrics: 'digit', strokes: [{ path: 'M 0 0 L 1.5 1' }] },
      'glyph x stroke 1: (1.5, 1) is outside the unit box',
    ],
  ])('rejects a bad glyph: %#', (source, message) => {
    expect(() => loadGlyph(source)).toThrow(message);
  });
});
