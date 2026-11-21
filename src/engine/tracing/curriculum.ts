/** Tracing levels (PLAN.md): T0 strokes, T1 digits, T2 the first lowercase and the c family. */
export type Level = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

/** Share of T0 items that must reach `UNLOCK_BOX` before T1 opens (PRD US-TRACE-04). */
export const UNLOCK_SHARE = 0.8;
export const UNLOCK_BOX = 3;

/** Direction is scored from T2 on, where the c family's counterclockwise start matters (§4.3). */
export function directionEnforced(level: Level): boolean {
  return level !== 'T0' && level !== 'T1';
}

/**
 * Whether T1 digits are open: a parent unlocked them, or enough T0 items reached box 3. `boxOf`
 * gives an item's Leitner box from the scheduler, and 0 for one never seen.
 */
export function digitsUnlocked(
  strokeIds: readonly string[],
  boxOf: (glyphId: string) => number,
  parentUnlocked: boolean,
): boolean {
  if (parentUnlocked) return true;
  if (strokeIds.length === 0) return false;
  const ready = strokeIds.filter((id) => boxOf(id) >= UNLOCK_BOX).length;
  return ready / strokeIds.length >= UNLOCK_SHARE;
}
