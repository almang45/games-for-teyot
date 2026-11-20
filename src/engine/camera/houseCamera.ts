import type { Rect } from '../../../contracts/common.ts';
import { STOREYS, type RoomId, type Storey } from '../../../contracts/rooms.ts';

/** What the camera shows: a rect of layout space, and how visible each storey is. */
export interface Shot {
  readonly view: Rect;
  /** Opacity per storey of the contract's STOREYS, indexed by storey: 1 shown, 0 faded out. */
  readonly alpha: readonly number[];
}

/** Layout space to game pixels: `game = layout * scale + offset`. */
export interface ViewTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Maps eased progress: 0 at the start of a move, 1 at its end. */
export type Ease = (t: number) => number;

/** A room the camera can zoom into: its `focus` rect, and its storey for the fade. */
export interface FocusTarget {
  readonly id: RoomId;
  readonly focus: Rect;
  readonly storey: Storey;
}

/** Fits `view` inside a `width` × `height` screen, centred; the house shows round the edges. */
export function fitView(view: Rect, width: number, height: number): ViewTransform {
  const [x, y, w, h] = view;
  const scale = Math.min(width / w, height / h);
  return { scale, x: (width - w * scale) / 2 - x * scale, y: (height - h * scale) / 2 - y * scale };
}

export type CameraSettled =
  { readonly on: 'room'; readonly room: RoomId } | { readonly on: 'overview' };

/**
 * The hub camera (PRD US-HOUSE-01, ARCHITECTURE §6): the overview, or zoomed into a room with the
 * storeys above it faded out. A new move starts from wherever the current one has got to, so a
 * zoom out cut short by an arrival turns smoothly into the next zoom in.
 */
export class HouseCamera {
  readonly #overview: Shot;
  #from: Shot;
  #to: Shot;
  #shot: Shot;
  #elapsed = 0;
  #duration = 0;
  #ease: Ease = (t) => t;
  #target: RoomId | undefined;
  #settled = true;

  constructor(overview: Rect) {
    this.#overview = { view: overview, alpha: STOREYS.map(() => 1) };
    this.#from = this.#overview;
    this.#to = this.#overview;
    this.#shot = this.#overview;
  }

  get shot(): Shot {
    return this.#shot;
  }

  /** The room it is zoomed into or zooming to; undefined for the overview or on the way out. */
  get room(): RoomId | undefined {
    return this.#target;
  }

  get moving(): boolean {
    return !this.#settled;
  }

  /** Whether a storey shows enough to be tapped: a faded storey must not catch a tap. */
  shows(storey: Storey): boolean {
    return (this.#shot.alpha[storey] ?? 1) >= 0.5;
  }

  focusOn(room: FocusTarget, durationMs: number, ease: Ease): void {
    const alpha = this.#overview.alpha.map((_, s) => (s <= room.storey ? 1 : 0));
    this.#start({ view: room.focus, alpha }, durationMs, ease);
    this.#target = room.id;
  }

  zoomOut(durationMs: number, ease: Ease): void {
    this.#start(this.#overview, durationMs, ease);
    this.#target = undefined;
  }

  /** Moves `dtMs` further; returns where it settled, once, on the step that ends the move. */
  advance(dtMs: number): CameraSettled | undefined {
    if (this.#settled) return undefined;
    this.#elapsed = Math.min(this.#duration, this.#elapsed + Math.max(0, dtMs));
    const done = this.#elapsed >= this.#duration;
    const t = done ? 1 : this.#ease(this.#elapsed / this.#duration);
    this.#shot = done ? this.#to : mix(this.#from, this.#to, t);
    if (!done) return undefined;
    this.#settled = true;
    return this.#target ? { on: 'room', room: this.#target } : { on: 'overview' };
  }

  #start(to: Shot, durationMs: number, ease: Ease): void {
    if (!(durationMs > 0)) throw new RangeError(`camera move needs a duration, got ${durationMs}`);
    this.#from = this.#shot;
    this.#to = to;
    this.#elapsed = 0;
    this.#duration = durationMs;
    this.#ease = ease;
    this.#settled = false;
  }
}

function mix(a: Shot, b: Shot, t: number): Shot {
  const at = (x: number, y: number): number => x + (y - x) * t;
  const [ax, ay, aw, ah] = a.view;
  const [bx, by, bw, bh] = b.view;
  return {
    view: [at(ax, bx), at(ay, by), at(aw, bw), at(ah, bh)],
    alpha: a.alpha.map((v, i) => at(v, b.alpha[i] ?? v)),
  };
}
