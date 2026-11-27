import type { Point } from '../../../contracts/common.ts';
import { checkNavGraph, type HouseLayout } from '../../../contracts/houseLayout.ts';
import type { RoomId, Storey } from '../../../contracts/rooms.ts';

/** A room's stand or a waypoint (door, stair end) of `layout.json` (ARCHITECTURE §6). */
export interface NavNode {
  readonly id: string;
  readonly pos: Point;
  readonly storey: Storey;
  /** On a stair run; an edge between two stair nodes is climbed, not walked. */
  readonly stair: boolean;
  /** Set on a room's stand node, whose id is the room id. */
  readonly room?: RoomId;
}

export interface NavGraph {
  readonly nodes: ReadonlyMap<string, NavNode>;
  readonly adjacency: ReadonlyMap<string, readonly string[]>;
}

/** The layout breaks a `checkNavGraph` rule, or a node is unknown: the hub can't route on it. */
export class NavGraphError extends Error {
  override readonly name = 'NavGraphError';
}

export const distance = ([ax, ay]: Point, [bx, by]: Point): number => Math.hypot(bx - ax, by - ay);

export const samePoint = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];

export const lerp = (a: Point, b: Point, t: number): Point =>
  t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distance(a, b);
  }
  return total;
}

/**
 * The graph `checkNavGraph` validates, so routing never runs on a graph the validator would
 * reject (a cross-storey edge walked flat, a room nobody can reach). The area checks of
 * `checkHouseLayout` are too slow for every house open; CI runs them on the shipped layout.
 */
export function buildNavGraph(layout: HouseLayout): NavGraph {
  const errors = checkNavGraph(layout).filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new NavGraphError(errors.map((i) => `${i.path}: ${i.message}`).join('; '));
  }
  const nodes = new Map<string, NavNode>();
  for (const r of layout.rooms) {
    nodes.set(r.id, { id: r.id, pos: r.stand, storey: r.storey, stair: false, room: r.id });
  }
  for (const w of layout.waypoints) {
    nodes.set(w.id, { id: w.id, pos: w.pos, storey: w.storey, stair: w.stair === true });
  }
  const adjacency = new Map<string, string[]>([...nodes.keys()].map((id) => [id, []]));
  for (const [a, b] of layout.edges) {
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  return { nodes, adjacency };
}

export function nodeOf(graph: NavGraph, id: string): NavNode {
  const node = graph.nodes.get(id);
  if (!node) throw new NavGraphError(`unknown node ${id}`);
  return node;
}

/**
 * Shortest walk from `from` to `to` by length, both ends included; undefined when `to` is
 * unreachable. Dijkstra with a linear scan: the graph has a few dozen nodes, and a room with two
 * doors makes a loop where the fewest hops is not the shortest walk.
 */
export function shortestPath(graph: NavGraph, from: string, to: string): string[] | undefined {
  nodeOf(graph, from);
  nodeOf(graph, to);
  const cost = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([from]);
  while (open.size > 0) {
    let id = '';
    let best = Infinity;
    for (const candidate of open) {
      const c = cost.get(candidate) ?? Infinity;
      if (c < best) [id, best] = [candidate, c];
    }
    open.delete(id);
    if (id === to) break;
    const here = nodeOf(graph, id).pos;
    for (const next of graph.adjacency.get(id) ?? []) {
      const c = best + distance(here, nodeOf(graph, next).pos);
      if (c < (cost.get(next) ?? Infinity)) {
        cost.set(next, c);
        previous.set(next, id);
        open.add(next);
      }
    }
  }
  if (!cost.has(to)) return undefined;
  const path = [to];
  for (let id = previous.get(to); id !== undefined; id = previous.get(id)) path.push(id);
  return path.reverse();
}

/** The stand-to-stand walk between two rooms as points, or undefined when `to` is unreachable. */
export function roomRoute(graph: NavGraph, from: string, to: string): Point[] | undefined {
  return shortestPath(graph, from, to)?.map((id) => nodeOf(graph, id).pos);
}
