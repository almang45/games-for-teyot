import type { Point } from '../../../contracts/common.ts';
import type { RoomId, Storey } from '../../../contracts/rooms.ts';
import {
  distance,
  lerp,
  nodeOf,
  pathLength,
  shortestPath,
  type NavGraph,
  type NavNode,
} from './graph.ts';

/** The two drawn facings (ASSETS.md §3.1): toward the viewer (`fr`) or away (`br`), both facing right. */
export type FacingView = 'fr' | 'br';

export interface Facing {
  readonly view: FacingView;
  /** Mirrors the right-facing art, so two drawn facings cover all four diagonals. */
  readonly flipX: boolean;
}

/**
 * Facing for a move on screen (y grows toward the viewer). A purely horizontal or vertical move
 * keeps the half of the previous facing it says nothing about.
 */
export function facingAlong(from: Point, to: Point, previous: Facing): Facing {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  let view = previous.view;
  if (dy > 0) view = 'fr';
  else if (dy < 0) view = 'br';
  let flipX = previous.flipX;
  if (dx < 0) flipX = true;
  else if (dx > 0) flipX = false;
  return { view, flipX };
}

export interface WalkPlan {
  readonly room: RoomId;
  /** Node ids she passes, in order, ending at the room's stand; empty when she is already there. */
  readonly via: readonly string[];
}

export interface Arrival {
  readonly room: RoomId;
  readonly pos: Point;
}

/**
 * Walks a character along the waypoint graph at constant speed (ARCHITECTURE §6). Positions are in
 * layout.json space, so a resize never touches a walk in progress.
 */
export class NavWalker {
  readonly #graph: NavGraph;
  readonly #speed: number;
  #pos: Point;
  /** Where the segment she is on starts: the last node she stood on or passed. */
  #from: NavNode;
  #ahead: NavNode[] = [];
  #target: RoomId | undefined;
  #room: RoomId;
  #facing: Facing = { view: 'fr', flipX: false };
  #onStair = false;

  /** `speed` is in layout px per second. */
  constructor(graph: NavGraph, start: RoomId, speed: number) {
    if (!(speed > 0)) throw new RangeError(`walk speed must be positive, got ${speed}`);
    this.#graph = graph;
    this.#speed = speed;
    this.#from = nodeOf(graph, start);
    this.#pos = this.#from.pos;
    this.#room = start;
  }

  get position(): Point {
    return this.#pos;
  }

  /** The storey of the node her segment starts at: a climb counts as its start until she tops it. */
  get storey(): Storey {
    return this.#from.storey;
  }

  get facing(): Facing {
    return this.#facing;
  }

  /** Between two stair nodes, where the art switches to the `stairs` animation. */
  get onStair(): boolean {
    return this.#onStair;
  }

  get walking(): boolean {
    return this.#target !== undefined;
  }

  /** Where she is headed while walking, else the room she last arrived in. */
  get room(): RoomId {
    return this.#target ?? this.#room;
  }

  /**
   * Routes to a room from where she is now, mid-walk included (PRD US-HOUSE-01). Mid-segment she
   * may turn back, whichever end of the segment gives the shorter walk. Undefined when the room
   * can't be reached; she then keeps whatever she was doing.
   */
  walkTo(room: RoomId): WalkPlan | undefined {
    const from = this.#from;
    const headingTo = this.#ahead[0];
    let best: { cost: number; nodes: NavNode[] } | undefined;
    for (const end of headingTo ? [from, headingTo] : [from]) {
      const ids = shortestPath(this.#graph, end.id, room);
      if (!ids) continue;
      const nodes = ids.map((id) => nodeOf(this.#graph, id));
      const cost = distance(this.#pos, end.pos) + pathLength(nodes.map((n) => n.pos));
      if (!best || cost < best.cost) best = { cost, nodes };
    }
    if (!best) return undefined;
    const nodes = best.nodes;
    if (nodes[0] === from) {
      // Mid-segment she turns back, so the segment now starts at the end she was heading to.
      // Standing on that node (idle, or exactly reached), there is no step to take to it.
      if (headingTo && distance(this.#pos, from.pos) > 0) this.#from = headingTo;
      else nodes.shift();
    }
    this.#ahead = nodes;
    this.#target = room;
    return { room, via: nodes.map((n) => n.id) };
  }

  /** Moves her `dtMs` further along; returns the arrival once, on the step that reaches the room. */
  advance(dtMs: number): Arrival | undefined {
    if (this.#target === undefined) return undefined;
    let budget = (this.#speed * Math.max(0, dtMs)) / 1000;
    for (let next = this.#ahead[0]; next; next = this.#ahead[0]) {
      const gap = distance(this.#pos, next.pos);
      this.#onStair = this.#from.stair && next.stair;
      if (gap > 0) this.#facing = facingAlong(this.#pos, next.pos, this.#facing);
      if (gap > budget) {
        this.#pos = lerp(this.#pos, next.pos, budget / gap);
        return undefined;
      }
      budget -= gap;
      this.#pos = next.pos;
      this.#from = next;
      this.#ahead.shift();
    }
    const room = this.#target;
    this.#target = undefined;
    this.#room = room;
    this.#onStair = false;
    return { room, pos: this.#pos };
  }
}
