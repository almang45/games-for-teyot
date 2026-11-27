import { isDue, isMastered, overdue, type ItemRecord } from './leitner';

/** Records by item id. An item with no record has never been scored. */
export type Records = ReadonlyMap<string, ItemRecord>;

/** PRD US-TRACE-04: a round has 3 items. */
export const ROUND_SIZE = 3;
/** Due reviews take at most 2 of every 3 slots, so a round always has room to move on. */
export const DUE_SHARE = 2 / 3;
/** Share of a level that must be mastered before the next one opens. */
export const UNLOCK_SHARE = 0.8;

export type Slot = 'due' | 'new' | 'easy' | 'fill';

export interface Pick {
  readonly id: string;
  /** Why it was picked: logged, and shown to the parent. */
  readonly slot: Slot;
}

/**
 * Picks one round from the unlocked items, given in curriculum order (ARCHITECTURE.md §5): items
 * due for review first, then the next new item, then one mastered item as an easy win, so a
 * round ends on a success. When one kind runs short, the round fills from the others, so it has
 * `size` items whenever that many are unlocked, and never the same item twice.
 */
export function pickRound(
  curriculum: readonly string[],
  records: Records,
  session: number,
  size = ROUND_SIZE,
): Pick[] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`a round needs ≥ 1 item, got ${size}`);
  if (new Set(curriculum).size !== curriculum.length) {
    throw new Error('the curriculum lists an item twice');
  }
  const order = new Map(curriculum.map((id, i) => [id, i]));
  const seen = curriculum.flatMap((id) => {
    const record = records.get(id);
    return record ? [{ id, record }] : [];
  });

  const due = seen
    .filter((s) => isDue(s.record, session))
    // Most overdue first, then the lower box (the shakier item), then curriculum order.
    .sort(
      (a, b) =>
        overdue(b.record, session) - overdue(a.record, session) ||
        a.record.box - b.record.box ||
        rank(order, a.id) - rank(order, b.id),
    )
    .map((s) => s.id);
  const fresh = curriculum.filter((id) => !records.has(id));
  const easy = seen
    .filter((s) => isMastered(s.record) && !isDue(s.record, session))
    // The one she hasn't seen for longest, then the highest box: the surest win.
    .sort(
      (a, b) =>
        a.record.lastSeenSession - b.record.lastSeenSession ||
        b.record.box - a.record.box ||
        rank(order, a.id) - rank(order, b.id),
    )
    .map((s) => s.id);
  const rest = seen
    .filter((s) => !isMastered(s.record) && !isDue(s.record, session))
    .sort(
      (a, b) =>
        a.record.lastSeenSession - b.record.lastSeenSession ||
        rank(order, a.id) - rank(order, b.id),
    )
    .map((s) => s.id);

  const taken = new Set<string>();
  const take = (ids: readonly string[], slot: Slot, max: number): Pick[] => {
    const out: Pick[] = [];
    for (const id of ids) {
      if (out.length >= max) break;
      if (taken.has(id)) continue;
      taken.add(id);
      out.push({ id, slot });
    }
    return out;
  };

  const maxDue = size === 1 ? 1 : Math.floor(size * DUE_SHARE);
  const dueTaken = take(due, 'due', maxDue);
  const head = [...dueTaken, ...take(fresh, 'new', Math.min(1, size - dueTaken.length))];
  // The easy win is kept for last, but only if there is room once the head is in.
  const easyWin = head.length < size ? take(easy, 'easy', 1) : [];
  const room = size - head.length - easyWin.length;
  const fill = take([...due, ...fresh, ...easy, ...rest], 'fill', room);
  return [...head, ...fill, ...easyWin];
}

/** Whether `ids` is mastered enough to open the next level (ARCHITECTURE.md §5). */
export function levelComplete(ids: readonly string[], records: Records): boolean {
  if (ids.length === 0) return false;
  const mastered = ids.filter((id) => isMastered(records.get(id))).length;
  return mastered / ids.length >= UNLOCK_SHARE;
}

/**
 * Whether an activity has something new or due, so Bubu points at its room (PRD US-HOUSE-02).
 * `unlocked` are its unlocked items.
 */
export function wantsVisit(
  unlocked: readonly string[],
  records: Records,
  session: number,
): boolean {
  return unlocked.some((id) => {
    const record = records.get(id);
    return record === undefined || isDue(record, session);
  });
}

/** How many of `ids` are mastered: each one opens a coloring page (PRD US-COLOR-04). */
export function masteredCount(ids: readonly string[], records: Records): number {
  return ids.filter((id) => isMastered(records.get(id))).length;
}

function rank(order: ReadonlyMap<string, number>, id: string): number {
  return order.get(id) ?? Number.MAX_SAFE_INTEGER;
}
