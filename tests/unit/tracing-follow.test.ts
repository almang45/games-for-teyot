import { describe, expect, it } from 'vitest';
import { CORRIDOR_RANGE, FOLLOW_DEFAULTS, FollowStroke } from '../../src/engine/tracing/follow';
import { loadGlyph } from '../../src/engine/tracing/glyph';
import { LatencyMeter } from '../../src/engine/tracing/latency';
import { parseStroke, pointAt } from '../../src/engine/tracing/path';
import { PointerGate } from '../../src/engine/tracing/pointerGate';
import circle from '../../src/content/glyphs/stroke.circle.json';

const params = FOLLOW_DEFAULTS;
const down = () => new FollowStroke(parseStroke('M 0.5 0 L 0.5 1'));

describe('Follow mode (US-TRACE-02)', () => {
  it('uses the age-3 corridor from ARCHITECTURE.md §4.3, inside the adaptive range', () => {
    expect(params.corridor).toBe(0.12);
    expect(params.corridor).toBeGreaterThanOrEqual(CORRIDOR_RANGE.min);
    expect(params.corridor).toBeLessThanOrEqual(CORRIDOR_RANGE.max);
  });

  it('moves the ball forward while the finger is in the corridor ahead', () => {
    const stroke = down();
    expect(stroke.feed({ x: 0.55, y: 0.1 }, params)).toBe(true);
    expect(stroke.progress).toBeCloseTo(0.1, 9);
    expect(stroke.ball).toEqual({ x: 0.5, y: stroke.progress });
  });

  it('stalls outside the corridor, behind the ball, and too far ahead', () => {
    const stroke = down();
    expect(stroke.feed({ x: 0.5 + params.corridor + 0.01, y: 0.1 }, params)).toBe(false);
    stroke.feed({ x: 0.5, y: 0.2 }, params);
    expect(stroke.feed({ x: 0.5, y: 0.1 }, params)).toBe(false);
    // Ahead of the look-ahead window, the nearest allowed point is the window end, too far away.
    expect(
      stroke.feed({ x: 0.5, y: 0.2 + params.lookahead + params.corridor + 0.01 }, params),
    ).toBe(false);
    expect(stroke.progress).toBeCloseTo(0.2, 9);
  });

  it('keeps progress across a lift, and finishes near the end', () => {
    const stroke = down();
    for (let y = 0.1; y < 0.98; y += 0.1) stroke.feed({ x: 0.5, y }, params);
    expect(stroke.done).toBe(false);
    stroke.feed({ x: 0.5, y: 1 - params.finish / 2 }, params);
    expect(stroke.done).toBe(true);
    expect(stroke.progress).toBe(stroke.path.length);
    expect(stroke.feed({ x: 0.5, y: 1 }, params)).toBe(false);
    expect(stroke.reaches({ x: 0.5, y: 1 }, params)).toBe(false);
  });

  it('is picked up near the ball or on the path just ahead of it', () => {
    const stroke = down();
    expect(stroke.reaches({ x: 0.5 + params.reach - 0.001, y: 0 }, params)).toBe(true);
    expect(stroke.reaches({ x: 0.5, y: 0.2 }, params)).toBe(true);
    expect(stroke.reaches({ x: 0.5, y: 0.8 }, params)).toBe(false);
    expect(stroke.reaches({ x: 0.9, y: 0.05 }, params)).toBe(false);
  });

  it('goes all the way round a circle without shortcutting to the end', () => {
    const ring = loadGlyph(circle).strokes[0];
    if (!ring) throw new Error('circle has no stroke');
    const stroke = new FollowStroke(ring);
    // A touch at the start is also the end; it must not finish the stroke.
    stroke.feed(pointAt(ring, 0), params);
    expect(stroke.progress).toBe(0);
    for (let s = 0.02; s <= ring.length + 0.02; s += 0.02) stroke.feed(pointAt(ring, s), params);
    expect(stroke.done).toBe(true);
  });

  it('can be traced fast, as long as each sample stays inside the window', () => {
    const stroke = down();
    for (const y of [0.2, 0.4, 0.6, 0.8, 1]) stroke.feed({ x: 0.5, y }, params);
    expect(stroke.done).toBe(true);
  });
});

describe('pointer gate (US-TRACE-05)', () => {
  const finger = { id: 1, type: 'touch', width: 20, height: 24 };

  it('lets the first finger near the ball draw and ignores a second one', () => {
    const gate = new PointerGate();
    expect(gate.down(finger, true, 90)).toEqual({ accepted: true });
    expect(gate.owns(1)).toBe(true);
    expect(gate.down({ ...finger, id: 2 }, true, 90)).toEqual({
      accepted: false,
      reason: 'second-pointer',
    });
    expect(gate.owns(2)).toBe(false);
    expect(gate.release(2)).toBe(false);
    expect(gate.release(1)).toBe(true);
    expect(gate.down({ ...finger, id: 2 }, true, 90).accepted).toBe(true);
  });

  it('ignores a palm by its contact size, whatever its order', () => {
    const gate = new PointerGate();
    expect(gate.down({ id: 3, type: 'touch', width: 140, height: 60 }, true, 90)).toEqual({
      accepted: false,
      reason: 'palm',
    });
    expect(gate.down(finger, true, 90).accepted).toBe(true);
  });

  it('ignores a touch away from the ball, so an unreported palm size still does not draw', () => {
    const gate = new PointerGate();
    expect(gate.down({ ...finger, width: 1, height: 1 }, false, 90)).toEqual({
      accepted: false,
      reason: 'out-of-reach',
    });
    expect(gate.owns(1)).toBe(false);
  });

  it('never treats a pen or mouse as a palm', () => {
    const gate = new PointerGate();
    expect(gate.down({ id: 4, type: 'pen', width: 200, height: 200 }, true, 90).accepted).toBe(
      true,
    );
    gate.reset();
    expect(gate.owns(4)).toBe(false);
    expect(gate.down({ id: 5, type: 'mouse', width: 200, height: 200 }, true, 90).accepted).toBe(
      true,
    );
  });
});

describe('latency meter (NFR: input latency < 30 ms)', () => {
  it('reports nearest-rank percentiles over a rolling window', () => {
    const meter = new LatencyMeter(10);
    expect(meter.summary()).toBeUndefined();
    for (let ms = 1; ms <= 20; ms++) meter.add(ms);
    expect(meter.summary()).toEqual({ count: 10, p50: 15, p95: 20, max: 20 });
    meter.add(-1);
    meter.add(Number.NaN);
    expect(meter.summary()?.count).toBe(10);
    meter.reset();
    expect(meter.summary()).toBeUndefined();
  });

  it('rounds to a tenth of a millisecond', () => {
    const meter = new LatencyMeter();
    meter.add(12.345);
    expect(meter.summary()).toEqual({ count: 1, p50: 12.3, p95: 12.3, max: 12.3 });
  });
});
