/** What the gate needs from a PointerEvent (ARCHITECTURE.md §4.2, PRD US-TRACE-05). */
export interface PointerContact {
  readonly id: number;
  readonly type: string;
  /** Contact size in CSS px. Touch screens report it; pens and mice report 1. */
  readonly width: number;
  readonly height: number;
}

export type IgnoreReason = 'second-pointer' | 'palm' | 'out-of-reach';

export type GateDecision =
  { readonly accepted: true } | { readonly accepted: false; readonly reason: IgnoreReason };

/**
 * Only one pointer draws: the first touch that lands within reach of the stroke. A second finger
 * is ignored while it draws. So is a resting palm, by its contact size, or by landing away from the
 * ball, which also covers screens that don't report contact size.
 */
export class PointerGate {
  private active: number | undefined;

  /** Decides whether a new pointer draws. `inReach` says whether it landed near the ball. */
  down(contact: PointerContact, inReach: boolean, palmPx: number): GateDecision {
    if (this.active !== undefined) return { accepted: false, reason: 'second-pointer' };
    if (contact.type === 'touch' && Math.max(contact.width, contact.height) > palmPx) {
      return { accepted: false, reason: 'palm' };
    }
    if (!inReach) return { accepted: false, reason: 'out-of-reach' };
    this.active = contact.id;
    return { accepted: true };
  }

  owns(id: number): boolean {
    return this.active === id;
  }

  /** Ends a pointer (up, cancel, lost capture). Returns whether it was the drawing one. */
  release(id: number): boolean {
    if (this.active !== id) return false;
    this.active = undefined;
    return true;
  }

  reset(): void {
    this.active = undefined;
  }
}
