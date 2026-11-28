import { describe, expect, it } from 'vitest';
import { TRACING } from '../../src/content/tracing';
import type { ItemRecord } from '../../src/engine/scheduler/leitner';
import { roomsToVisit, unlockedTracing, type Learner } from '../../src/game/visits';
import { buildPlaceholderHouse } from '../../src/placeholder/house';

const { layout } = buildPlaceholderHouse();
const strokes = TRACING.find((l) => l.level === 'T0')?.glyphs.map((g) => g.id) ?? [];
const digits = TRACING.find((l) => l.level === 'T1')?.glyphs.map((g) => g.id) ?? [];

/** Seen and passed in session 1, in `box`. */
const seen = (box: ItemRecord['box']): ItemRecord => ({
  box,
  waitFromSession: 1,
  lastSeenSession: 1,
  attempts: 1,
  successes: 1,
  sessionMisses: 0,
});

const learner = (
  records: ReadonlyMap<string, ItemRecord>,
  session = 1,
  digitsUnlocked = false,
): Learner => ({ records, session, settings: { digitsUnlocked } });

describe('unlockedTracing', () => {
  it('opens the strokes first, and the digits once 80% of strokes reach box 3', () => {
    expect(strokes.length).toBeGreaterThan(0);
    expect(unlockedTracing(learner(new Map()))).toEqual(strokes);
    const ready = Math.ceil(strokes.length * 0.8);
    const records = new Map(strokes.slice(0, ready).map((id) => [id, seen(3)]));
    expect(unlockedTracing(learner(records))).toEqual([...strokes, ...digits]);
    const short = new Map(strokes.slice(0, ready - 1).map((id) => [id, seen(3)]));
    expect(unlockedTracing(learner(short))).toEqual(strokes);
  });

  it('opens the digits when a parent unlocked them', () => {
    expect(unlockedTracing(learner(new Map(), 1, true))).toEqual([...strokes, ...digits]);
  });

  it('opens nothing for a level that has no content', () => {
    expect(unlockedTracing(learner(new Map()), [])).toEqual([]);
  });
});

describe('roomsToVisit (US-HOUSE-02)', () => {
  it('wants her in the bedroom while a tracing item is new', () => {
    expect(roomsToVisit(layout.rooms, learner(new Map()))).toEqual(['kamar-tidur']);
  });

  it('lets her be once every open item was seen and none is due', () => {
    const records = new Map(strokes.map((id) => [id, seen(2)]));
    expect(roomsToVisit(layout.rooms, learner(records, 1))).toEqual([]);
    // Box 2 waits 2 sessions: due again in session 3.
    expect(roomsToVisit(layout.rooms, learner(records, 3))).toEqual(['kamar-tidur']);
  });

  it('counts every scheduled activity of a room, in the order the rooms are given', () => {
    const scheduled = { tracing: () => ['stroke.vertical'], counting: () => ['count.1'] };
    const rooms = roomsToVisit(layout.rooms, learner(new Map()), scheduled);
    expect(rooms.toSorted()).toEqual(['dapur', 'kamar-tidur']);
    expect(rooms).toEqual(layout.rooms.map((r) => r.id).filter((id) => rooms.includes(id)));
    expect(roomsToVisit(layout.rooms, learner(new Map()), {})).toEqual([]);
  });
});
