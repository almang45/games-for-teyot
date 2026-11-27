import type { Activity, RoomId } from '../../contracts/rooms.ts';
import { TRACING, type LevelContent } from '../content/tracing';
import { wantsVisit, type Records } from '../engine/scheduler/picker';
import { digitsUnlocked } from '../engine/tracing/curriculum';
import type { Settings } from '../storage';

/** What decides which items an activity has open. */
export interface Learner {
  readonly records: Records;
  readonly session: number;
  readonly settings: Pick<Settings, 'digitsUnlocked'>;
}

const idsOf = (level: LevelContent | undefined): string[] => level?.glyphs.map((g) => g.id) ?? [];

/** T0 strokes always, T1 digits once she or a parent opened them (PRD US-TRACE-04, US-PARENT-03). */
export function unlockedTracing(
  learner: Learner,
  levels: readonly LevelContent[] = TRACING,
): string[] {
  const strokes = idsOf(levels.find((l) => l.level === 'T0'));
  const digits = idsOf(levels.find((l) => l.level === 'T1'));
  const boxOf = (id: string): number => learner.records.get(id)?.box ?? 0;
  return digitsUnlocked(strokes, boxOf, learner.settings.digitsUnlocked)
    ? [...strokes, ...digits]
    : strokes;
}

/**
 * The scheduled activities and their open items. An activity is missing until its content ships;
 * coloring, tidy-up and bedtime have no items to review, so they never call Bubu over.
 */
export type ActivityItems = Partial<Record<Activity, (learner: Learner) => readonly string[]>>;

export const SCHEDULED: ActivityItems = { tracing: (learner) => unlockedTracing(learner) };

/** Rooms with something new or due, in the order given: where Bubu points (PRD US-HOUSE-02). */
export function roomsToVisit(
  rooms: readonly { readonly id: RoomId; readonly activities: readonly Activity[] }[],
  learner: Learner,
  scheduled: ActivityItems = SCHEDULED,
): RoomId[] {
  return rooms
    .filter((room) =>
      room.activities.some((a) => {
        const items = scheduled[a]?.(learner);
        return items !== undefined && wantsVisit(items, learner.records, learner.session);
      }),
    )
    .map((room) => room.id);
}
