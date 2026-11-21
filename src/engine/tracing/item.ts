import { CORRIDOR_RANGE } from './follow';

/** Successful Follow completions an item needs before it moves to Score mode (US-TRACE-03). */
export const FOLLOWS_BEFORE_SCORE = 2;
/** Misses in a row on one stroke before it falls back to Follow (US-TRACE-03). */
export const MISSES_BEFORE_FALLBACK = 3;

/** How the item is drawn this time: guided by the ball, or free and scored. */
export type DrawMode = 'follow' | 'score';

export type InputKind = 'touch' | 'mouse';

/** What the scene shows next. Each step ends with the event named after it. */
export type ItemStep =
  /** Bubu's paw draws: the whole item ("Lihat", US-TRACE-01), or one stroke again after a miss. */
  | { readonly kind: 'demo'; readonly stroke: number | 'all' }
  /** She draws one stroke. */
  | { readonly kind: 'draw'; readonly stroke: number; readonly mode: DrawMode }
  /** The ink fades while Ocica comforts her and the hint clip plays, before the demo replays. */
  | { readonly kind: 'miss'; readonly stroke: number; readonly fallback: boolean }
  | { readonly kind: 'done'; readonly result: ItemResult };

export type ItemEvent =
  | { readonly type: 'demo-done' }
  | { readonly type: 'stroke-done'; readonly passed: boolean }
  | { readonly type: 'miss-done' };

export interface StrokeResult {
  /** Score mode misses before the stroke was done. */
  readonly misses: number;
  /** Whether it ended in Follow mode after `MISSES_BEFORE_FALLBACK` misses. */
  readonly fellBack: boolean;
}

export interface ItemResult {
  readonly mode: DrawMode;
  /** Mouse attempts are practice: the scheduler skips them (PRD US-LAPTOP-02). */
  readonly practice: boolean;
  readonly strokes: readonly StrokeResult[];
  /** Successful Follow completions to store for the item, this one included. */
  readonly followCompletions: number;
}

export interface ItemOptions {
  readonly strokes: number;
  /** Stored from earlier rounds. */
  readonly followCompletions: number;
  readonly input: InputKind;
}

/** A mouse can't feel its way along a path, so it always follows, in the widest corridor. */
export const MOUSE_CORRIDOR = CORRIDOR_RANGE.max;

/**
 * One tracing item, from the "Lihat" demo to its last stroke (PRD US-TRACE-01..03). The flow is
 * pure: the scene shows each step and reports how it ended, so the order of voices and motion
 * is fixed here and can be tested without Phaser.
 */
export class TracingItem {
  readonly mode: DrawMode;
  private readonly options: ItemOptions;
  private current: ItemStep = { kind: 'demo', stroke: 'all' };
  private stroke = 0;
  private misses = 0;
  private readonly results: StrokeResult[] = [];

  constructor(options: ItemOptions) {
    if (!Number.isInteger(options.strokes) || options.strokes < 1) {
      throw new Error(`a tracing item needs at least one stroke, got ${options.strokes}`);
    }
    this.options = options;
    this.mode =
      options.input === 'touch' && options.followCompletions >= FOLLOWS_BEFORE_SCORE
        ? 'score'
        : 'follow';
  }

  get step(): ItemStep {
    return this.current;
  }

  /** Advances on how the current step ended, and returns the next one. */
  next(event: ItemEvent): ItemStep {
    const step = this.current;
    if (step.kind === 'demo' && event.type === 'demo-done') {
      this.current = this.draw();
    } else if (step.kind === 'draw' && event.type === 'stroke-done') {
      this.current = this.strokeDone(step.mode, event.passed);
    } else if (step.kind === 'miss' && event.type === 'miss-done') {
      this.current = { kind: 'demo', stroke: step.stroke };
    } else {
      throw new Error(`tracing item: ${event.type} does not end a ${step.kind} step`);
    }
    return this.current;
  }

  private draw(): ItemStep {
    const fallback = this.misses >= MISSES_BEFORE_FALLBACK;
    return { kind: 'draw', stroke: this.stroke, mode: fallback ? 'follow' : this.mode };
  }

  private strokeDone(mode: DrawMode, passed: boolean): ItemStep {
    // Follow mode can only stall, never fail: the scene reports it once the ball arrives.
    if (mode === 'follow' && !passed) throw new Error('tracing item: a Follow stroke cannot fail');
    if (!passed) {
      this.misses += 1;
      return {
        kind: 'miss',
        stroke: this.stroke,
        fallback: this.misses >= MISSES_BEFORE_FALLBACK,
      };
    }
    this.results.push({
      misses: this.misses,
      fellBack: this.mode === 'score' && mode === 'follow',
    });
    this.stroke += 1;
    this.misses = 0;
    if (this.stroke < this.options.strokes) return this.draw();
    return { kind: 'done', result: this.result() };
  }

  private result(): ItemResult {
    const practice = this.options.input === 'mouse';
    const counts = this.mode === 'follow' && !practice;
    return {
      mode: this.mode,
      practice,
      strokes: [...this.results],
      followCompletions: this.options.followCompletions + (counts ? 1 : 0),
    };
  }
}
