import type { Point } from '../../../contracts/common.ts';
import type { HouseLayout } from '../../../contracts/houseLayout.ts';
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

/** The layout broke a rule `checkHouseLayout` enforces; the hub can't route on it. */
export class NavGraphError extends Error {
  override readonly name = 'NavGraphError';
}

export function buildNavGraph(layout: HouseLayout): NavGraph {
  const nodes = new Map<string, NavNode>();
  const add = (node: NavNode): void => {
    if (nodes.has(node.id)) throw new NavGraphError(`duplicate node id ${node.id}`);
    nodes.set(node.id, node);
  };
  for (const r of layout.rooms) {
    add({ id: r.id, pos: r.stand, storey: r.storey, stair: false, room: r.id });
  }
  for (const w of layout.waypoints) {
    add({ id: w.id, pos: w.pos, storey: w.storey, stair: w.stair === true });
  }
  const adjacency = new Map<string, string[]>([...nodes.keys()].map((id) => [id, []]));
  for (const [a, b] of layout.edges) {
    const fromList = adjacency.get(a);
    const toList = adjacency.get(b);
    if (!fromList || !toList) throw new NavGraphError(`edge ${a} → ${b} names an unknown node`);
    fromList.push(b);
    toList.push(a);
  }
  return { nodes, adjacency };
}

export function nodeOf(graph: NavGraph, id: string): NavNode {
  const node = graph.nodes.get(id);
  if (!node) throw new NavGraphError(`unknown node ${id}`);
  return node;
}

/**
 * Fewest-hop path from `from` to `to`, both ends included; undefined when `to` is unreachable.
 * BFS is enough: the graph has a few dozen nodes, and doors and stairs make it nearly a tree.
 */
export function hops(graph: NavGraph, from: string, to: string): string[] | undefined {
  nodeOf(graph, from);
  nodeOf(graph, to);
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (id === to) break;
    for (const next of graph.adjacency.get(id) ?? []) {
      if (!previous.has(next)) {
        previous.set(next, id);
        queue.push(next);
      }
    }
  }
  if (!previous.has(to)) return undefined;
  const path: string[] = [];
  for (let id: string | null | undefined = to; id; id = previous.get(id)) path.push(id);
  return path.reverse();
}

export const distance = ([ax, ay]: Point, [bx, by]: Point): number => Math.hypot(bx - ax, by - ay);

export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distance(a, b);
  }
  return total;
}
