import { CORRIDOR_RANGE, FOLLOW_DEFAULTS } from './follow';

/** Adaptive tolerance rules (ARCHITECTURE.md §4.4, PRD US-TRACE-06). */
export const TOLERANCE_WINDOW = 10;
export const TOLERANCE_STEP = 0.01;
export const TIGHTEN_ABOVE = 0.85;
export const LOOSEN_BELOW = 0.5;

/** What one level keeps between sessions. */
export interface ToleranceState {
  readonly corridor: number;
  /** Score mode results since the last change, oldest first, at most `TOLERANCE_WINDOW`. */
  readonly results: readonly boolean[];
}

export interface ToleranceChange {
  readonly from: number;
  readonly to: number;
  readonly direction: 'tighten' | 'loosen';
  /** Success rate over the window that triggered the change. */
  readonly rate: number;
}

export const INITIAL_TOLERANCE: ToleranceState = {
  corridor: FOLLOW_DEFAULTS.corridor,
  results: [],
};

/**
 * The corridor `w` for one level, adapted from the last 10 Score mode strokes. The window starts
 * over after each change, so every step is judged on 10 strokes at the new width rather than
 * sliding to a limit on the strength of results from the old one.
 */
export class AdaptiveTolerance {
  private corridorValue: number;
  private results: boolean[];

  constructor(state: ToleranceState = INITIAL_TOLERANCE) {
    if (!Number.isFinite(state.corridor))
      throw new Error(`corridor ${state.corridor} is not a number`);
    this.corridorValue = clamp(state.corridor);
    this.results = state.results.slice(-TOLERANCE_WINDOW);
  }

  /** The adaptive value. Use `effectiveCorridor` for what the game draws with. */
  get corridor(): number {
    return this.corridorValue;
  }

  get state(): ToleranceState {
    return { corridor: this.corridorValue, results: [...this.results] };
  }

  /** Records one Score mode stroke. Returns the change, for the caller to log, if `w` moved. */
  record(passed: boolean): ToleranceChange | undefined {
    this.results.push(passed);
    if (this.results.length > TOLERANCE_WINDOW) this.results.shift();
    if (this.results.length < TOLERANCE_WINDOW) return undefined;
    const rate = this.results.filter(Boolean).length / this.results.length;
    let direction: ToleranceChange['direction'];
    if (rate > TIGHTEN_ABOVE) direction = 'tighten';
    else if (rate < LOOSEN_BELOW) direction = 'loosen';
    else return undefined;
    const from = this.corridorValue;
    const to = clamp(from + (direction === 'tighten' ? -TOLERANCE_STEP : TOLERANCE_STEP));
    // At a limit there is nothing to change, so the window keeps sliding.
    if (to === from) return undefined;
    this.corridorValue = to;
    this.results = [];
    return { from, to, direction, rate };
  }
}

/** A parent's setting replaces the adaptive value (US-TRACE-06), inside the same range. */
export function effectiveCorridor(adaptive: number, parentOverride: number | undefined): number {
  return parentOverride === undefined ? adaptive : clamp(parentOverride);
}

/**
 * §4.2: on a small screen a corridor in glyph heights can get too thin for a finger, so it never
 * goes below `floorPx` on screen. The floor itself comes out of the spike (US-TRACE-00).
 */
export function withScreenFloor(corridor: number, glyphHeightPx: number, floorPx: number): number {
  if (!(glyphHeightPx > 0)) throw new Error(`glyph height ${glyphHeightPx} px must be positive`);
  return Math.max(corridor, floorPx / glyphHeightPx);
}

function clamp(w: number): number {
  // Rounded to the step, so repeated ±0.01 never drifts into 0.11000000000000001.
  const snapped = Math.round(w / TOLERANCE_STEP) * TOLERANCE_STEP;
  return Number(Math.min(CORRIDOR_RANGE.max, Math.max(CORRIDOR_RANGE.min, snapped)).toFixed(4));
}
