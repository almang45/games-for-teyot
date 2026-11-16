import type { Point } from '../../../contracts/common.ts';
import { distance, pathLength } from './graph.ts';
import { Polyline } from './polyline.ts';
import { facingAlong, type Facing } from './walker.ts';

export interface CompanionPose {
  readonly pos: Point;
  readonly facing: Facing;
  /** Moved on the last update: the art plays `walk`, else `idle`. */
  readonly moving: boolean;
  /** Total distance walked, in layout px: drives the phase of Bubu's hop and Ocica's sway. */
  readonly travelled: number;
}

export interface Parking {
  readonly bubu: Point;
  readonly ocica: Point;
}

/** Theia as the companions see her on each frame. */
export interface TheiaState {
  readonly pos: Point;
  /** Length of what is left of her walk (NavWalker.remaining). */
  readonly remaining: number;
  readonly walking: boolean;
}

export interface CompanionTuning {
  /** Theia's speed in layout px per second; the companions' speeds are multiples of it. */
  readonly theiaSpeed: number;
  /** How far ahead of Theia Bubu may hop, along her route. */
  readonly lead: number;
  /** How far behind Theia Ocica keeps, along her trail. */
  readonly gap: number;
}

/** Bubu hops faster than Theia walks so it gets ahead; Ocica only just keeps up. */
const BUBU_SPEED_FACTOR = 1.6;
const OCICA_SPEED_FACTOR = 1.15;

class Mover {
  pos: Point;
  facing: Facing = { view: 'fr', flipX: false };
  moving = false;
  travelled = 0;

  constructor(pos: Point) {
    this.pos = pos;
  }

  /** Steps to `next`, or, standing still, turns to look at `lookAt`. */
  step(next: Point, lookAt: Point): void {
    const moved = distance(this.pos, next);
    this.moving = moved > 0;
    if (this.moving) {
      this.facing = facingAlong(this.pos, next, this.facing);
      this.travelled += moved;
      this.pos = next;
    } else {
      this.facing = facingAlong(this.pos, lookAt, this.facing);
    }
  }

  get pose(): CompanionPose {
    return { pos: this.pos, facing: this.facing, moving: this.moving, travelled: this.travelled };
  }
}

/**
 * Bubu and Ocica following Theia (PRD US-HOUSE-02). Both stay on paths Theia herself walks, so
 * they go through doors and up stairs and never cut through a wall:
 * - Bubu hops along her route, at most `lead` ahead of her, and waits on the room's parking spot.
 * - Ocica waddles along the trail Theia actually walked, `gap` behind her, turns included, and
 *   goes to her parking spot once Theia has arrived.
 */
export class Companions {
  readonly #tuning: CompanionTuning;
  readonly #bubu: Mover;
  readonly #ocica: Mover;
  /** Bubu's path: back to Theia, then her route, then the room's parking spot. */
  #bubuPath: Polyline;
  #bubuS = 0;
  /** Where Theia's route starts on Bubu's path, and how long that route is. */
  #routeStart = 0;
  #routeLength = 0;
  /** Theia's arc on Bubu's path at the last update. */
  #theiaArc = 0;
  /** Points Theia passed that Ocica still has to walk, in order. */
  #trail: Point[] = [];
  #ocicaParking: Point | undefined;

  constructor(parking: Parking, tuning: CompanionTuning) {
    if (!(tuning.theiaSpeed > 0) || tuning.lead < 0 || tuning.gap < 0) {
      throw new RangeError('companion speed must be positive, lead and gap not negative');
    }
    this.#tuning = tuning;
    this.#bubu = new Mover(parking.bubu);
    this.#ocica = new Mover(parking.ocica);
    this.#bubuPath = new Polyline([parking.bubu]);
  }

  get bubu(): CompanionPose {
    return this.#bubu.pose;
  }

  get ocica(): CompanionPose {
    return this.#ocica.pose;
  }

  /** Theia got a new route (NavWalker.route right after walkTo) to a room with these spots. */
  follow(route: readonly Point[], parking: Parking): void {
    const [start] = route;
    // Already standing in that room: nobody needs to move.
    if (!start || pathLength(route) === 0) return;
    // Bubu gets back to where Theia is along the path he was on, so a turn never crosses a wall.
    const back = this.#bubuPath.between(this.#bubuS, this.#theiaArc);
    this.#routeStart = pathLength([...back, start]);
    this.#routeLength = pathLength(route);
    this.#bubuPath = new Polyline([...back, ...route, parking.bubu]);
    this.#bubuS = 0;
    this.#theiaArc = this.#routeStart;

    this.#trail.push(start);
    this.#ocicaParking = parking.ocica;
  }

  update(dtMs: number, theia: TheiaState): void {
    const dt = Math.max(0, dtMs) / 1000;
    const walked = Math.max(0, this.#routeLength - (theia.walking ? theia.remaining : 0));
    this.#theiaArc = this.#routeStart + walked;

    const end = this.#bubuPath.length;
    const cap = theia.walking ? Math.min(this.#theiaArc + this.#tuning.lead, end) : end;
    const bubuStep = this.#tuning.theiaSpeed * BUBU_SPEED_FACTOR * dt;
    this.#bubuS = Math.max(this.#bubuS, Math.min(this.#bubuS + bubuStep, cap));
    this.#bubu.step(this.#bubuPath.at(this.#bubuS), theia.pos);

    let keep = this.#tuning.gap;
    if (theia.walking) {
      const last = this.#trail.at(-1);
      if (!last || distance(last, theia.pos) > 0) this.#trail.push(theia.pos);
    } else {
      if (this.#ocicaParking) {
        this.#trail.push(theia.pos, this.#ocicaParking);
        this.#ocicaParking = undefined;
      }
      keep = 0;
    }
    const ocicaStep = this.#tuning.theiaSpeed * OCICA_SPEED_FACTOR * dt;
    const ahead = pathLength([this.#ocica.pos, ...this.#trail]) - keep;
    this.#ocica.step(this.#walkTrail(Math.min(ocicaStep, Math.max(0, ahead))), theia.pos);
  }

  /** Ocica's position `budget` further along the trail; the points she passes are dropped. */
  #walkTrail(budget: number): Point {
    let pos = this.#ocica.pos;
    let left = budget;
    for (let next = this.#trail[0]; next; next = this.#trail[0]) {
      const gap = distance(pos, next);
      if (gap > left) return new Polyline([pos, next]).at(left);
      left -= gap;
      pos = next;
      this.#trail.shift();
    }
    return pos;
  }
}
