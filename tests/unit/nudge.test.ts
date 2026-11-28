import { describe, expect, it } from 'vitest';
import {
  IdleNudge,
  NUDGE_IDLE_MS,
  NUDGE_REPEAT_MS,
  nextNudgeRoom,
} from '../../src/engine/nav/nudge';

/** Runs `ms` of frames while she is idle and returns the times, from the start, of each nudge. */
function idle(nudge: IdleNudge, ms: number, frame = 16): number[] {
  const at: number[] = [];
  for (let t = frame; t <= ms; t += frame) if (nudge.update(frame, true)) at.push(t);
  return at;
}

describe('IdleNudge (US-HOUSE-02)', () => {
  it('nudges 5 s after the last touch, then every 20 s', () => {
    const at = idle(new IdleNudge(), 50_000);
    expect(at).toHaveLength(3);
    const [first = 0, second = 0, third = 0] = at;
    expect(first).toBeGreaterThanOrEqual(NUDGE_IDLE_MS);
    expect(first).toBeLessThan(NUDGE_IDLE_MS + 16);
    expect(second - first).toBeGreaterThanOrEqual(NUDGE_REPEAT_MS);
    expect(third - second).toBeLessThan(NUDGE_REPEAT_MS + 16);
  });

  it('starts over on a touch', () => {
    const nudge = new IdleNudge();
    expect(idle(nudge, 4_000)).toEqual([]);
    nudge.reset();
    expect(idle(nudge, 4_000)).toEqual([]);
    expect(idle(nudge, 1_100)).toHaveLength(1);
    nudge.reset();
    // After a touch the next nudge is 5 s away again, not the 20 s repeat.
    expect(idle(nudge, 5_100)).toHaveLength(1);
  });

  it('holds while she walks or a room has the screen, and starts over after', () => {
    const nudge = new IdleNudge();
    expect(idle(nudge, 4_000)).toEqual([]);
    expect(nudge.update(60_000, false)).toBe(false);
    expect(idle(nudge, 4_000)).toEqual([]);
    expect(idle(nudge, 1_100)).toHaveLength(1);
  });

  it('counts one long frame once and ignores negative ones', () => {
    const nudge = new IdleNudge();
    expect(nudge.update(-10_000, true)).toBe(false);
    expect(nudge.update(60_000, true)).toBe(true);
    expect(nudge.update(0, true)).toBe(false);
  });

  it('refuses delays that are not positive', () => {
    expect(() => new IdleNudge(0, 1)).toThrow(RangeError);
    expect(() => new IdleNudge(1, Number.NaN)).toThrow(RangeError);
  });
});

describe('nextNudgeRoom', () => {
  it('shows a room other than hers first, then moves on with each repeat', () => {
    const wanting = ['kamar-tidur', 'dapur', 'ruang-keluarga'];
    expect(nextNudgeRoom(wanting, 'ruang-keluarga', undefined)).toBe('kamar-tidur');
    expect(nextNudgeRoom(wanting, 'ruang-keluarga', 'kamar-tidur')).toBe('dapur');
    expect(nextNudgeRoom(wanting, 'ruang-keluarga', 'dapur')).toBe('kamar-tidur');
  });

  it('shows her own room when it is the only one, and nothing when none wants her', () => {
    expect(nextNudgeRoom(['dapur'], 'dapur', undefined)).toBe('dapur');
    expect(nextNudgeRoom(['dapur'], 'dapur', 'dapur')).toBe('dapur');
    expect(nextNudgeRoom([], 'dapur', undefined)).toBeUndefined();
  });

  it('starts from the first room when the last one no longer wants her', () => {
    expect(nextNudgeRoom(['kamar-tidur', 'dapur'], 'ruang-keluarga', 'kantor-papa')).toBe(
      'kamar-tidur',
    );
  });
});
