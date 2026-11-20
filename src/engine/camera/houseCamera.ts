import type { Point, Rect } from '../../../contracts/common.ts';
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

/** The game's size in game pixels. */
export interface Screen {
  readonly width: number;
  readonly height: number;
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

/**
 * Moves `view` the least it takes for the screen it fills to stay on `frame`, so panning never
 * runs off the house. Along an axis where the screen shows more than the frame, it is centred.
 */
export function clampView(view: Rect, frame: Rect, screen: Screen): Rect {
  const [x, y, w, h] = view;
  const { scale } = fitView(view, screen.width, screen.height);
  const along = (
    start: number,
    size: number,
    shown: number,
    from: number,
    span: number,
  ): number => {
    const centre = start + size / 2;
    const placed =
      shown >= span
        ? from + span / 2
        : Math.min(Math.max(centre, from + shown / 2), from + span - shown / 2);
    return placed === centre ? start : placed - size / 2;
  };
  return [
    along(x, w, screen.width / scale, frame[0], frame[2]),
    along(y, h, screen.height / scale, frame[1], frame[3]),
    w,
    h,
  ];
}

export type CameraSettled =
  | { readonly on: 'room'; readonly room: RoomId }
  | { readonly on: 'framed'; readonly room: RoomId }
  | { readonly on: 'overview' };

/** A thrown pan slows with this time constant, as kinetic scrolling does on a phone. */
const GLIDE_TIME_CONSTANT_MS = 325;
/** Game px per ms below which a glide has stopped, and a release does not throw at all. */
const GLIDE_MIN_SPEED = 0.05;
/** Only the finger's last moves set a throw's speed, so a pause before letting go throws nothing. */
const GLIDE_WINDOW_MS = 100;

interface TrailPoint {
  readonly t: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The hub camera (PRD US-HOUSE-01 and US-HOUSE-05, ARCHITECTURE §6): the overview, a room framed
 * with every storey shown (the phone's hub), or zoomed into a room with the storeys above it faded
 * out. A new move starts from wherever the current one has got to, so a zoom out cut short by an
 * arrival turns smoothly into the next zoom in. A drag or pinch takes the view over at once, while
 * the fade of a move in progress carries on; a released drag glides to a stop.
 */
export class HouseCamera {
  readonly #overview: Shot;
  readonly #minWidth: number;
  #screen: Screen | undefined;
  #from: Shot;
  #to: Shot;
  #shot: Shot;
  #elapsed = 0;
  #duration = 0;
  #ease: Ease = (t) => t;
  #target: RoomId | undefined;
  #framed: RoomId | undefined;
  #settled = true;
  #trail: TrailPoint[] = [];
  #velocity: Point | undefined;

  /** `minWidth` is the narrowest view a pinch may zoom in to, in layout px. */
  constructor(overview: Rect, minWidth = overview[2] / 2) {
    this.#overview = { view: overview, alpha: STOREYS.map(() => 1) };
    this.#minWidth = Math.min(minWidth, overview[2]);
    this.#from = this.#overview;
    this.#to = this.#overview;
    this.#shot = this.#overview;
  }

  get shot(): Shot {
    return this.#shot;
  }

  /** The room it is zoomed into or zooming to; undefined for the overview, a framing or on the way out. */
  get room(): RoomId | undefined {
    return this.#target;
  }

  /** Moving on its own: a zoom, a framing or a glide, but not a finger holding it still. */
  get moving(): boolean {
    return !this.#settled || this.#velocity !== undefined;
  }

  get gliding(): boolean {
    return this.#velocity !== undefined;
  }

  /** Whether a storey shows enough to be tapped: a faded storey must not catch a tap. */
  shows(storey: Storey): boolean {
    return (this.#shot.alpha[storey] ?? 1) >= 0.5;
  }

  /** The screen the view is fitted to, which panning stays inside; refits the current shot. */
  resize(screen: Screen): void {
    this.#screen = screen;
    this.#render();
  }

  focusOn(room: FocusTarget, durationMs: number, ease: Ease): void {
    const alpha = this.#overview.alpha.map((_, s) => (s <= room.storey ? 1 : 0));
    this.#start({ view: room.focus, alpha }, durationMs, ease);
    this.#target = room.id;
    this.#framed = undefined;
  }

  /** Frames a room with every storey shown, so the rooms round it stay in reach. */
  frame(room: FocusTarget, durationMs: number, ease: Ease): void {
    this.#start({ view: room.focus, alpha: this.#overview.alpha }, durationMs, ease);
    this.#target = undefined;
    this.#framed = room.id;
  }

  /** Frames a room at once: where the phone's hub opens. Settles silently. */
  frameNow(room: FocusTarget): void {
    this.frame(room, 1, (t) => t);
    this.#elapsed = this.#duration;
    this.#settled = true;
    this.#render();
  }

  zoomOut(durationMs: number, ease: Ease): void {
    this.#start(this.#overview, durationMs, ease);
    this.#target = undefined;
    this.#framed = undefined;
  }

  /** Shows the overview at once, as on a screen that fits the whole house. Settles silently. */
  overviewNow(): void {
    this.zoomOut(1, (t) => t);
    this.#elapsed = this.#duration;
    this.#settled = true;
    this.#render();
  }

  /** A finger went down: any glide stops where it is, and a new trail starts at `nowMs`. */
  hold(nowMs: number): void {
    this.#velocity = undefined;
    this.#trail = [{ t: nowMs, x: 0, y: 0 }];
  }

  /** Pans so the house follows a finger that moved `dx`, `dy` game px. */
  drag(dx: number, dy: number, nowMs: number): void {
    const last = this.#trail.at(-1) ?? { t: nowMs, x: 0, y: 0 };
    this.#trail.push({ t: nowMs, x: last.x + dx, y: last.y + dy });
    while (this.#trail.length > 2 && (this.#trail[1]?.t ?? nowMs) < nowMs - GLIDE_WINDOW_MS) {
      this.#trail.shift();
    }
    this.#panBy(dx, dy);
  }

  /** The finger let go: a throw keeps the house gliding. Returns whether it glides. */
  release(nowMs: number): boolean {
    const last = this.#trail.at(-1);
    const first = this.#trail.find((p) => p.t >= nowMs - GLIDE_WINDOW_MS) ?? last;
    this.#trail = [];
    if (!first || !last || last.t <= first.t || nowMs - last.t > GLIDE_WINDOW_MS) return false;
    const dt = last.t - first.t;
    const v: Point = [(last.x - first.x) / dt, (last.y - first.y) / dt];
    if (Math.hypot(...v) < GLIDE_MIN_SPEED) return false;
    this.#velocity = v;
    return true;
  }

  /**
   * Zooms by `factor` (above 1 spreads the fingers and zooms in) about `at` in game px, which stays
   * under the fingers. It stops at `minWidth` one way and at the whole house the other.
   */
  pinch(factor: number, at: Point): void {
    if (!(factor > 0)) throw new RangeError(`pinch needs a positive factor, got ${factor}`);
    const view = this.#shot.view;
    const [x, y, w, h] = view;
    const [, , ow, oh] = this.#overview.view;
    const k = Math.min(Math.max(1 / factor, this.#minWidth / w), Math.min(ow / w, oh / h));
    const [px, py] = this.#toLayout(at, view);
    this.#take([px - (px - x) * k, py - (py - y) * k, w * k, h * k]);
  }

  /** Moves `dtMs` further; returns where a move settled, once, on the step that ends it. */
  advance(dtMs: number): CameraSettled | undefined {
    const dt = Math.max(0, dtMs);
    this.#glide(dt);
    if (this.#settled) return undefined;
    this.#elapsed = Math.min(this.#duration, this.#elapsed + dt);
    this.#render();
    if (this.#elapsed < this.#duration) return undefined;
    this.#settled = true;
    if (this.#target) return { on: 'room', room: this.#target };
    return this.#framed ? { on: 'framed', room: this.#framed } : { on: 'overview' };
  }

  #start(to: Shot, durationMs: number, ease: Ease): void {
    if (!(durationMs > 0)) throw new RangeError(`camera move needs a duration, got ${durationMs}`);
    this.#from = this.#shot;
    this.#to = to;
    this.#elapsed = 0;
    this.#duration = durationMs;
    this.#ease = ease;
    this.#settled = false;
    this.#velocity = undefined;
  }

  #glide(dt: number): void {
    const v = this.#velocity;
    if (!v || dt === 0) return;
    // Integrates the exponential slow-down over the step, so the glide is frame-rate independent.
    const decay = Math.exp(-dt / GLIDE_TIME_CONSTANT_MS);
    const reach = GLIDE_TIME_CONSTANT_MS * (1 - decay);
    const [bx, by] = this.#shot.view;
    this.#panBy(v[0] * reach, v[1] * reach);
    const [ax, ay] = this.#shot.view;
    // An edge of the house stops the glide along that axis.
    const next: Point = [ax === bx ? 0 : v[0] * decay, ay === by ? 0 : v[1] * decay];
    this.#velocity = Math.hypot(...next) < GLIDE_MIN_SPEED ? undefined : next;
  }

  #panBy(dx: number, dy: number): void {
    const view = this.#shot.view;
    const { scale } = this.#fit(view);
    const [x, y, w, h] = view;
    this.#take([x - dx / scale, y - dy / scale, w, h]);
  }

  /** A gesture sets the view outright; a move in progress keeps fading the storeys. */
  #take(view: Rect): void {
    this.#from = { view, alpha: this.#from.alpha };
    this.#to = { view, alpha: this.#to.alpha };
    this.#render();
  }

  #render(): void {
    const t = this.#elapsed >= this.#duration ? 1 : this.#ease(this.#elapsed / this.#duration);
    const shot = t === 1 ? this.#to : mix(this.#from, this.#to, t);
    const screen = this.#screen;
    this.#shot = screen
      ? { view: clampView(shot.view, this.#overview.view, screen), alpha: shot.alpha }
      : shot;
  }

  #fit(view: Rect): ViewTransform {
    const screen = this.#screen;
    if (!screen) throw new Error('camera gesture before resize(): it has no screen to map');
    return fitView(view, screen.width, screen.height);
  }

  #toLayout([gx, gy]: Point, view: Rect): Point {
    const { scale, x, y } = this.#fit(view);
    return [(gx - x) / scale, (gy - y) / scale];
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
