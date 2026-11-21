import { describe, expect, it } from 'vitest';
import {
  applyOutcome,
  BOX_INTERVALS,
  isDue,
  isMastered,
  MISSES_TO_DEMOTE,
  type Box,
  type ItemRecord,
  type Outcome,
} from '../../src/engine/scheduler/leitner';
import {
  levelComplete,
  masteredCount,
  pickRound,
  wantsVisit,
  type Records,
} from '../../src/engine/scheduler/picker';

const rec = (box: Box, lastSeenSession: number, extra: Partial<ItemRecord> = {}): ItemRecord => ({
  box,
  lastSeenSession,
  attempts: 1,
  successes: 1,
  sessionMisses: 0,
  ...extra,
});

/** Plays outcomes in order, each `[session, outcome]`, from no record. */
function play(steps: readonly (readonly [number, Outcome])[]): ItemRecord | undefined {
  let record: ItemRecord | undefined;
  for (const [session, outcome] of steps) record = applyOutcome(record, outcome, session).record;
  return record;
}

describe('Leitner boxes in sessions (ARCHITECTURE.md §5)', () => {
  it('waits 1, 2, 4, 8, 16 sessions per box', () => {
    expect(BOX_INTERVALS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
    for (const box of [1, 2, 3, 4, 5] as const) {
      const wait = BOX_INTERVALS[box];
      const r = rec(box, 10);
      expect(isDue(r, 10 + wait - 1)).toBe(false);
      expect(isDue(r, 10 + wait)).toBe(true);
    }
  });

  it('enters a new item in box 1, and a first success promotes it', () => {
    expect(applyOutcome(undefined, 'miss', 0)).toEqual({
      record: { box: 1, lastSeenSession: 0, attempts: 1, successes: 0, sessionMisses: 1 },
      change: undefined,
    });
    expect(applyOutcome(undefined, 'success', 0)).toEqual({
      record: { box: 2, lastSeenSession: 0, attempts: 1, successes: 1, sessionMisses: 0 },
      change: { from: 1, to: 2 },
    });
  });

  it('promotes one box per success when due, up to box 5', () => {
    const r = play([
      [0, 'success'],
      [2, 'success'],
      [6, 'success'],
      [14, 'success'],
      [30, 'success'],
    ]);
    expect(r).toMatchObject({ box: 5, attempts: 5, successes: 5, lastSeenSession: 30 });
  });

  it('does not promote a success that was not due: easy wins and second goes', () => {
    const { record, change } = applyOutcome(rec(3, 10), 'success', 11);
    expect(change).toBeUndefined();
    expect(record).toMatchObject({ box: 3, attempts: 2, successes: 2, lastSeenSession: 11 });
    // A new item done twice in its first session climbs once.
    expect(
      play([
        [0, 'success'],
        [0, 'success'],
      ]),
    ).toMatchObject({ box: 2, attempts: 2 });
  });

  it(`demotes one box on the ${MISSES_TO_DEMOTE}rd miss in a session, once, never below box 1`, () => {
    let r: ItemRecord | undefined = rec(4, 1);
    const changes = [];
    for (let i = 0; i < 5; i++) {
      const next = applyOutcome(r, 'miss', 9);
      r = next.record;
      changes.push(next.change);
    }
    expect(changes).toEqual([undefined, undefined, { from: 4, to: 3 }, undefined, undefined]);
    expect(r).toMatchObject({ box: 3, sessionMisses: 5, attempts: 6, successes: 1 });
    expect(
      play([
        [0, 'miss'],
        [0, 'miss'],
        [0, 'miss'],
      ]),
    ).toMatchObject({ box: 1 });
  });

  it('counts misses per session, so misses spread over sessions never demote', () => {
    const r = play([
      [0, 'success'],
      [1, 'miss'],
      [1, 'miss'],
      [2, 'miss'],
      [3, 'miss'],
      [3, 'miss'],
    ]);
    expect(r).toMatchObject({ box: 2, sessionMisses: 2 });
  });

  it('US-LAPTOP-02 leaves the record alone for practice', () => {
    const r = rec(2, 4);
    expect(applyOutcome(r, 'practice', 9)).toEqual({ record: r, change: undefined });
    expect(applyOutcome(undefined, 'practice', 9).record).toBeUndefined();
  });

  it('refuses sessions that go backwards or are not whole numbers', () => {
    expect(() => applyOutcome(rec(2, 5), 'success', 4)).toThrow(/before the item's last session/);
    expect(() => applyOutcome(undefined, 'success', 1.5)).toThrow(/whole number/);
    expect(() => applyOutcome(undefined, 'success', -1)).toThrow(/whole number/);
  });

  it('counts box 3 and up as mastered', () => {
    expect(isMastered(undefined)).toBe(false);
    expect(isMastered(rec(2, 0))).toBe(false);
    expect(isMastered(rec(3, 0))).toBe(true);
  });
});

describe('a round of 3 (US-TRACE-04, ARCHITECTURE.md §5)', () => {
  const T0 = ['vertical', 'horizontal', 'circle', 'diagonal', 'cross', 'zigzag', 'wave'];
  const records = (entries: Record<string, ItemRecord>): Records =>
    new Map(Object.entries(entries));

  it('puts due items first, then a new one, then an easy win', () => {
    const r = records({
      vertical: rec(1, 8), // due at 9
      horizontal: rec(2, 6), // due at 8: more overdue
      circle: rec(5, 9), // mastered, not due
    });
    expect(pickRound(T0, r, 10)).toEqual([
      { id: 'horizontal', slot: 'due' },
      { id: 'vertical', slot: 'due' },
      { id: 'diagonal', slot: 'new' },
    ]);
    // With one due, the easy win gets its slot, last.
    const oneDue = records({ vertical: rec(1, 9), circle: rec(5, 9), horizontal: rec(3, 9) });
    expect(pickRound(T0, oneDue, 10)).toEqual([
      { id: 'vertical', slot: 'due' },
      { id: 'diagonal', slot: 'new' },
      { id: 'circle', slot: 'easy' }, // seen as long ago as horizontal, but in a higher box
    ]);
  });

  it('gives due reviews at most 2 of 3 slots while there is something new', () => {
    const allDue = records(Object.fromEntries(T0.slice(0, 5).map((id) => [id, rec(1, 0)])));
    const round = pickRound(T0, allDue, 10);
    expect(round.map((p) => p.slot)).toEqual(['due', 'due', 'new']);
    expect(round[2]?.id).toBe('zigzag');
  });

  it('breaks due ties by the lower box, then curriculum order', () => {
    const r = records({ circle: rec(2, 8), vertical: rec(1, 9), horizontal: rec(1, 9) });
    expect(pickRound(T0, r, 10, 2)).toEqual([
      { id: 'vertical', slot: 'due' },
      { id: 'diagonal', slot: 'new' },
    ]);
    // circle (box 2, overdue 0) ties vertical and horizontal (box 1, overdue 0) on lateness.
    expect(pickRound(T0.slice(0, 3), r, 10).map((p) => p.id)).toEqual([
      'vertical',
      'horizontal',
      'circle',
    ]);
  });

  it('fills from what is left when a kind runs short, never twice the same item', () => {
    // The very first round: nothing due or mastered yet, so three new items.
    expect(pickRound(T0, new Map(), 0)).toEqual([
      { id: 'vertical', slot: 'new' },
      { id: 'horizontal', slot: 'fill' },
      { id: 'circle', slot: 'fill' },
    ]);
    // Everything seen this session and nothing mastered: the least recently seen come back.
    const seen = records({ vertical: rec(1, 10), horizontal: rec(2, 9), circle: rec(1, 10) });
    expect(pickRound(T0.slice(0, 3), seen, 10).map((p) => p.id)).toEqual([
      'horizontal',
      'vertical',
      'circle',
    ]);
    // Fewer unlocked items than slots: a shorter round.
    expect(pickRound(['vertical'], new Map(), 0)).toEqual([{ id: 'vertical', slot: 'new' }]);
  });

  it('picks the easy win she has not seen for longest', () => {
    const r = records({
      vertical: rec(5, 9),
      horizontal: rec(4, 6),
      circle: rec(4, 7),
      diagonal: rec(1, 9), // due
    });
    expect(pickRound(T0.slice(0, 4), r, 10)).toEqual([
      { id: 'diagonal', slot: 'due' },
      { id: 'circle', slot: 'fill' },
      { id: 'horizontal', slot: 'easy' },
    ]);
  });

  it('refuses a bad size or a curriculum that lists an item twice', () => {
    expect(() => pickRound(T0, new Map(), 0, 0)).toThrow(/≥ 1 item/);
    expect(() => pickRound(['vertical', 'vertical'], new Map(), 0)).toThrow(/twice/);
    expect(pickRound(T0, new Map(), 0, 1)).toEqual([{ id: 'vertical', slot: 'new' }]);
  });
});

describe('unlocks and nudges', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const boxes = (...b: Box[]): Records => new Map(b.map((box, i) => [ids[i] ?? '', rec(box, 0)]));

  it('opens the next level at 80% mastered', () => {
    expect(levelComplete(ids, boxes(3, 3, 3, 2, 1))).toBe(false);
    expect(levelComplete(ids, boxes(3, 4, 5, 3, 1))).toBe(true);
    expect(levelComplete([], new Map())).toBe(false);
  });

  it('US-COLOR-04 counts mastered items, one coloring page each', () => {
    expect(masteredCount(ids, boxes(3, 2, 5))).toBe(2);
  });

  it('US-HOUSE-02 wants a visit when an activity has something new or due', () => {
    const r: Records = new Map([
      ['a', rec(2, 5)],
      ['b', rec(1, 6)],
    ]);
    expect(wantsVisit(['a', 'b'], r, 6)).toBe(false);
    expect(wantsVisit(['a', 'b'], r, 7)).toBe(true); // b is due
    expect(wantsVisit(['a', 'b', 'c'], r, 6)).toBe(true); // c is new
    expect(wantsVisit([], r, 6)).toBe(false);
  });
});
