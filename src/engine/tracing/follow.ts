import { dist, pointAt, project, type Point, type Polyline } from './path';

/** Follow mode tuning (ARCHITECTURE.md §4.2). All lengths are in glyph heights (H). */
export interface FollowParams {
  /** Corridor half-width `w`: how far from the path the finger may be and still pull the ball. */
  readonly corridor: number;
  /** How far ahead of the ball the finger may be and still pull it. */
  readonly lookahead: number;
  /** How far from the ball a touch may land and still pick the stroke up. */
  readonly reach: number;
  /** A stroke this close to its end counts as done, and the ink snaps the rest. */
  readonly finish: number;
}

/** Age-3 defaults: `w` from §4.3, reach from its start threshold. */
export const FOLLOW_DEFAULTS: FollowParams = {
  corridor: 0.12,
  lookahead: 0.25,
  reach: 0.15,
  finish: 0.03,
};

/** §4.4: the adaptive range `w` stays in. */
export const CORRIDOR_RANGE = { min: 0.08, max: 0.18 } as const;

/**
 * One stroke in Follow mode. A lead ball sits at the stroke head and moves forward only when the
 * finger is inside the corridor ahead of it, so she can stall but never go wrong. Progress is kept
 * when the finger lifts.
 */
export class FollowStroke {
  readonly path: Polyline;
  private head = 0;

  constructor(path: Polyline) {
    this.path = path;
  }

  /** Arc length the ball has reached. */
  get progress(): number {
    return this.head;
  }

  get done(): boolean {
    return this.head >= this.path.length;
  }

  get ball(): Point {
    return pointAt(this.path, this.head);
  }

  /** Whether a touch landing at `p` picks the stroke up: near the ball, or on the path ahead. */
  reaches(p: Point, params: FollowParams): boolean {
    if (this.done) return false;
    if (dist(p, this.ball) <= params.reach) return true;
    return this.ahead(p, params).distance <= params.corridor;
  }

  /** Feeds one finger sample. Returns whether the ball moved. */
  feed(p: Point, params: FollowParams): boolean {
    if (this.done) return false;
    const nearest = this.ahead(p, params);
    if (nearest.distance > params.corridor || nearest.s <= this.head) return false;
    // Near the end, snap: a 3-year-old's finger often stops just short of it.
    this.head = this.path.length - nearest.s <= params.finish ? this.path.length : nearest.s;
    return true;
  }

  /** Only the window ahead counts, so a closed stroke like a circle can't jump to its end. */
  private ahead(p: Point, params: FollowParams): ReturnType<typeof project> {
    return project(this.path, p, this.head, this.head + params.lookahead);
  }
}
