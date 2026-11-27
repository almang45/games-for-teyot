/** PRD US-HOUSE-02: Bubu points at a room after 5 s without a tap, and again every 20 s at most. */
export const NUDGE_IDLE_MS = 5_000;
export const NUDGE_REPEAT_MS = 20_000;

/**
 * The clock behind Bubu's nudge. It runs only while the hub is waiting on Theia: a walk, a zoom
 * into a room or a touch sets it back, so he never points while she is busy or mid-gesture.
 */
export class IdleNudge {
  readonly #idleMs: number;
  readonly #repeatMs: number;
  #idle = 0;
  /** `#idle` at the last nudge since she was busy, or undefined before the first. */
  #nudgedAt: number | undefined;

  constructor(idleMs = NUDGE_IDLE_MS, repeatMs = NUDGE_REPEAT_MS) {
    if (!(idleMs > 0) || !(repeatMs > 0)) {
      throw new RangeError('the nudge delays must be positive');
    }
    this.#idleMs = idleMs;
    this.#repeatMs = repeatMs;
  }

  /** She touched the screen. */
  reset(): void {
    this.#idle = 0;
    this.#nudgedAt = undefined;
  }

  /** True on the frame Bubu should point. `waiting` is false while she walks or a room has the screen. */
  update(dtMs: number, waiting: boolean): boolean {
    if (!waiting) {
      this.reset();
      return false;
    }
    this.#idle += Math.max(0, dtMs);
    const due =
      this.#nudgedAt === undefined
        ? this.#idle >= this.#idleMs
        : this.#idle - this.#nudgedAt >= this.#repeatMs;
    if (due) this.#nudgedAt = this.#idle;
    return due;
  }
}

/**
 * The room Bubu points at next, from the rooms that want a visit in house order. A room other than
 * hers comes first, since she is already where her own room is; each repeat moves on to the next
 * room, so one she ignores doesn't hold the nudge forever.
 */
export function nextNudgeRoom<R>(
  wanting: readonly R[],
  current: R,
  last: R | undefined,
): R | undefined {
  const elsewhere = wanting.filter((r) => r !== current);
  const pool = elsewhere.length > 0 ? elsewhere : wanting;
  const at = last === undefined ? -1 : pool.indexOf(last);
  return pool[(at + 1) % pool.length];
}
