/**
 * Leitner boxes counted in sessions, not days (ARCHITECTURE.md §5): a 3-year-old plays
 * irregularly, so a week away must not make everything overdue at once.
 */

export type Box = 1 | 2 | 3 | 4 | 5;

/** Sessions to wait before an item in each box is due again. */
export const BOX_INTERVALS: Readonly<Record<Box, number>> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

/** Box 3 and up counts as mastered: for unlocks, easy wins and the parent's progress view. */
export const MASTERED_BOX: Box = 3;

/** Misses in one session that demote an item one box. */
export const MISSES_TO_DEMOTE = 3;

/** What is stored per learnable item (`stroke.circle`, `digit.4`, `count.5`). */
export interface ItemRecord {
  readonly box: Box;
  /**
   * Session the current box's wait counts from: its last passed review or demotion. Attempts
   * that change nothing (an easy win, a miss short of demotion) leave it, so they never push a
   * review further away.
   */
  readonly waitFromSession: number;
  /** Session number of the last scored attempt. */
  readonly lastSeenSession: number;
  readonly attempts: number;
  readonly successes: number;
  /** Misses in `lastSeenSession`, so three in one session can demote. */
  readonly sessionMisses: number;
}

/**
 * How an attempt ended. `practice` (a mouse on the laptop, PRD US-LAPTOP-02) is never scored,
 * so it leaves the record as it was.
 */
export type Outcome = 'success' | 'miss' | 'practice';

export interface BoxChange {
  readonly from: Box;
  readonly to: Box;
}

export function isDue(record: ItemRecord, session: number): boolean {
  return session - record.waitFromSession >= BOX_INTERVALS[record.box];
}

/** Sessions past due: 0 when due right now, negative when not due yet. */
export function overdue(record: ItemRecord, session: number): number {
  return session - record.waitFromSession - BOX_INTERVALS[record.box];
}

export function isMastered(record: ItemRecord | undefined): boolean {
  return record !== undefined && record.box >= MASTERED_BOX;
}

/**
 * Applies one attempt. A new item enters box 1. A success promotes one box, but only when the
 * item was new or due: an easy win on a mastered item, or a second go in the same session, must
 * not climb the boxes without the wait that makes them mean something. A due item that is missed
 * stays due, so a retry in the same session can still promote it and, if the session ends first,
 * it comes back next time. The third miss in a session demotes one box, once per session, and
 * never below box 1. Only a passed review or a demotion restarts the wait, and a demotion
 * restarts it even in box 1, so a 4th try in the same session can't climb straight back.
 */
export function applyOutcome(
  record: ItemRecord | undefined,
  outcome: Outcome,
  session: number,
): { readonly record: ItemRecord | undefined; readonly change: BoxChange | undefined } {
  if (!Number.isInteger(session) || session < 0) {
    throw new Error(`session ${session} must be a whole number ≥ 0`);
  }
  if (record && session < record.lastSeenSession) {
    throw new Error(
      `session ${session} is before the item's last session ${record.lastSeenSession}`,
    );
  }
  if (outcome === 'practice') return { record, change: undefined };

  const base: ItemRecord = record ?? {
    box: 1,
    waitFromSession: session,
    lastSeenSession: session,
    attempts: 0,
    successes: 0,
    sessionMisses: 0,
  };
  const reviewable = record === undefined || isDue(record, session);
  const passedReview = outcome === 'success' && reviewable;
  const misses = record?.lastSeenSession === session ? base.sessionMisses : 0;
  let box = base.box;
  const sessionMisses = outcome === 'miss' ? misses + 1 : misses;
  const demoted = outcome === 'miss' && sessionMisses === MISSES_TO_DEMOTE;
  if (passedReview) box = promote(box);
  if (demoted) box = demote(box);
  const next: ItemRecord = {
    box,
    // Box 5 can't climb, so its reviewed success restarts the wait without a box change.
    waitFromSession: passedReview || demoted ? session : base.waitFromSession,
    lastSeenSession: session,
    attempts: base.attempts + 1,
    successes: base.successes + (outcome === 'success' ? 1 : 0),
    sessionMisses,
  };
  const change = box === base.box ? undefined : { from: base.box, to: box };
  return { record: next, change };
}

function promote(box: Box): Box {
  return box === 5 ? 5 : ((box + 1) as Box);
}

function demote(box: Box): Box {
  return box === 1 ? 1 : ((box - 1) as Box);
}
