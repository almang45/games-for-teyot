import { describe, expect, it } from 'vitest';
import type { Point } from '../../contracts/common';
import { checkHouseLayout, houseLayout, type HouseLayout } from '../../contracts/houseLayout';
import {
  buildNavGraph,
  lerp,
  NavGraphError,
  nodeOf,
  pathLength,
  shortestPath,
  type NavGraph,
  type NavNode,
} from '../../src/engine/nav/graph';
import { paintOrder, roomAt } from '../../src/engine/nav/hit';
import { facingAlong, NavWalker, type Facing } from '../../src/engine/nav/walker';
import { buildPlaceholderHouse } from '../../src/placeholder/house';

const { layout } = buildPlaceholderHouse();
const graph = buildNavGraph(layout);
const SPEED = 400;

const posOf = (id: string): Point => nodeOf(graph, id).pos;

/** A graph built by hand, past buildNavGraph's layout checks, to test routing on its own. */
function rawGraph(
  nodes: Iterable<NavNode>,
  edges: readonly (readonly [string, string])[],
): NavGraph {
  const byId = new Map([...nodes].map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>([...byId.keys()].map((id) => [id, []]));
  for (const [a, b] of edges) {
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  return { nodes: byId, adjacency };
}

const ground = (id: string, pos: Point, stair = false): NavNode => ({ id, pos, storey: 0, stair });

/** Advances in 16 ms frames until she arrives; fails after `maxMs` of walking. */
function walkUntilArrival(walker: NavWalker, maxMs = 20_000): { room: string; ms: number } {
  for (let ms = 0; ms <= maxMs; ms += 16) {
    const arrival = walker.advance(16);
    if (arrival) return { room: arrival.room, ms };
  }
  throw new Error(`no arrival within ${maxMs} ms`);
}

describe('placeholder house', () => {
  it('passes the layout.json contract, so the hub runs on contract-shaped data', () => {
    expect(houseLayout.parse(layout)).toEqual(layout);
    expect(checkHouseLayout(layout)).toEqual([]);
  });

  it('spans every M1 storey the walk needs: ground, mezzanine, upstairs', () => {
    expect(new Set(layout.rooms.map((r) => r.storey))).toEqual(new Set([0, 1, 2]));
  });
});

describe('nav graph', () => {
  it('has a node per room stand and waypoint, linked both ways', () => {
    expect(graph.nodes.size).toBe(layout.rooms.length + layout.waypoints.length);
    expect(nodeOf(graph, 'dapur').room).toBe('dapur');
    expect(graph.adjacency.get('pintu-dapur')).toEqual(['dapur', 'ruang-keluarga']);
  });

  it('routes through doors and up both flights of stairs', () => {
    expect(shortestPath(graph, 'ruang-keluarga', 'kamar-tidur')).toEqual([
      'ruang-keluarga',
      'tangga-1-bawah',
      'tangga-1-atas',
      'kantor-papa',
      'tangga-2-bawah',
      'tangga-2-atas',
      'kamar-tidur',
    ]);
    expect(shortestPath(graph, 'dapur', 'dapur')).toEqual(['dapur']);
  });

  it('takes the shortest walk, not the fewest hops, around a loop', () => {
    // Two hops over a far corner, or three along the straight wall.
    const loop = rawGraph(
      [
        ground('a', [0, 0]),
        ground('far', [50, 500]),
        ground('p', [33, 0]),
        ground('q', [66, 0]),
        ground('b', [100, 0]),
      ],
      [
        ['a', 'far'],
        ['far', 'b'],
        ['a', 'p'],
        ['p', 'q'],
        ['q', 'b'],
      ],
    );
    expect(shortestPath(loop, 'a', 'b')).toEqual(['a', 'p', 'q', 'b']);
  });

  it('returns undefined for an unreachable node and throws on an unknown one', () => {
    const island = rawGraph(graph.nodes.values(), []);
    expect(shortestPath(island, 'dapur', 'kamar-tidur')).toBeUndefined();
    expect(() => shortestPath(graph, 'dapur', 'loteng')).toThrow(NavGraphError);
  });

  it('rejects any layout checkHouseLayout rejects', () => {
    const dupe = {
      ...layout,
      waypoints: [{ id: 'dapur', pos: [0, 0] as Point, storey: 0 as const }],
    };
    expect(() => buildNavGraph(dupe)).toThrow(/duplicate node id dapur/);
    const dangling: HouseLayout = { ...layout, edges: [...layout.edges, ['dapur', 'loteng']] };
    expect(() => buildNavGraph(dangling)).toThrow(/unknown node loteng/);
    expect(() => buildNavGraph({ ...layout, edges: [] })).toThrow(NavGraphError);
    expect(() => buildNavGraph({ ...layout, edges: [] })).toThrow(/not reachable/);
  });

  it('measures polylines', () => {
    expect(
      pathLength([
        [0, 0],
        [3, 4],
        [3, 10],
      ]),
    ).toBe(11);
    expect(pathLength([])).toBe(0);
  });

  it('interpolates and lands exactly on the far end', () => {
    expect(lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    const end: Point = [0.1, 0.7];
    expect(lerp([0.3, 0.2], end, 1)).toBe(end);
  });
});

describe('roomAt', () => {
  it('finds the room under a tap and nothing outside every room', () => {
    for (const room of layout.rooms) expect(roomAt(layout, room.stand)?.id).toBe(room.id);
    expect(roomAt(layout, [5, 5])).toBeUndefined();
  });

  it('gives an overlap to the higher storey, then to the room nearer the viewer', () => {
    const square = (x: number, y: number): Point[] => [
      [x, y],
      [x + 100, y],
      [x + 100, y + 100],
      [x, y + 100],
    ];
    const [a, b, c] = layout.rooms;
    if (!a || !b || !c) throw new Error('fixture rooms missing');
    const stacked: HouseLayout = {
      ...layout,
      rooms: [
        { ...a, polygon: square(0, 0), storey: 0, stand: [50, 90] },
        { ...b, polygon: square(0, 0), storey: 2, stand: [50, 10] },
        { ...c, polygon: square(0, 0), storey: 2, stand: [50, 20] },
      ],
    };
    expect(roomAt(stacked, [50, 50])?.id).toBe(c.id);
    // The hub paints in the same order, so the room a tap picks is the one drawn on top.
    expect([...stacked.rooms].sort(paintOrder).at(-1)?.id).toBe(c.id);
  });
});

describe('facingAlong', () => {
  const fr: Facing = { view: 'fr', flipX: false };

  it('maps the four screen diagonals onto two drawn facings and a flip', () => {
    expect(facingAlong([0, 0], [2, 1], fr)).toEqual({ view: 'fr', flipX: false });
    expect(facingAlong([0, 0], [-2, 1], fr)).toEqual({ view: 'fr', flipX: true });
    expect(facingAlong([0, 0], [2, -1], fr)).toEqual({ view: 'br', flipX: false });
    expect(facingAlong([0, 0], [-2, -1], fr)).toEqual({ view: 'br', flipX: true });
  });

  it('keeps what a straight horizontal or vertical move says nothing about', () => {
    const brLeft: Facing = { view: 'br', flipX: true };
    expect(facingAlong([0, 0], [5, 0], brLeft)).toEqual({ view: 'br', flipX: false });
    expect(facingAlong([0, 0], [0, 5], brLeft)).toEqual({ view: 'fr', flipX: true });
    expect(facingAlong([0, 0], [0, 0], brLeft)).toEqual(brLeft);
  });
});

describe('NavWalker', () => {
  it('starts standing in the start room', () => {
    const walker = new NavWalker(graph, layout.start, SPEED);
    expect(walker.position).toEqual(posOf(layout.start));
    expect(walker.room).toBe(layout.start);
    expect(walker.walking).toBe(false);
    expect(walker.advance(16)).toBeUndefined();
  });

  it('refuses a speed that would never arrive', () => {
    expect(() => new NavWalker(graph, 'dapur', 0)).toThrow(RangeError);
    expect(() => new NavWalker(graph, 'dapur', Number.NaN)).toThrow(RangeError);
  });

  it('walks the route at constant speed and arrives once, on the room stand', () => {
    const walker = new NavWalker(graph, 'ruang-keluarga', SPEED);
    const plan = walker.walkTo('kamar-tidur');
    expect(plan?.via.at(0)).toBe('tangga-1-bawah');
    expect(plan?.via.at(-1)).toBe('kamar-tidur');
    expect(walker.walking).toBe(true);
    expect(walker.room).toBe('kamar-tidur');

    const ids = ['ruang-keluarga', ...(plan?.via ?? [])];
    const expectedMs = (pathLength(ids.map(posOf)) / SPEED) * 1000;
    const { room, ms } = walkUntilArrival(walker);
    expect(room).toBe('kamar-tidur');
    expect(Math.abs(ms - expectedMs)).toBeLessThanOrEqual(16);
    expect(walker.position).toEqual(posOf('kamar-tidur'));
    expect(walker.storey).toBe(2);
    expect(walker.walking).toBe(false);
    expect(walker.advance(16)).toBeUndefined();
  });

  it('flags the stair segments and faces away from the viewer going up', () => {
    const walker = new NavWalker(graph, 'ruang-keluarga', SPEED);
    walker.walkTo('kantor-papa');
    const seen: { stair: boolean; storey: number; view: string }[] = [];
    for (let i = 0; i < 400 && walker.walking; i++) {
      walker.advance(16);
      seen.push({ stair: walker.onStair, storey: walker.storey, view: walker.facing.view });
    }
    const climb = seen.filter((s) => s.stair);
    expect(climb.length).toBeGreaterThan(0);
    expect(climb.every((s) => s.view === 'br')).toBe(true);
    expect(seen.at(-1)).toMatchObject({ stair: false, storey: 1 });
  });

  it('arrives straight away when she is already in the room', () => {
    const walker = new NavWalker(graph, 'dapur', SPEED);
    expect(walker.walkTo('dapur')?.via).toEqual([]);
    expect(walker.advance(0)).toEqual({ room: 'dapur', pos: posOf('dapur') });
  });

  it('re-routes mid-walk from where she is, never jumping back to the start', () => {
    const walker = new NavWalker(graph, 'ruang-keluarga', SPEED);
    walker.walkTo('kamar-tidur');
    for (let i = 0; i < 20; i++) walker.advance(16);
    const midway = walker.position;
    expect(midway).not.toEqual(posOf('ruang-keluarga'));

    const plan = walker.walkTo('dapur');
    // She was heading up the stairs, so she turns back to the living room on the way to dapur.
    expect(plan?.via).toEqual(['ruang-keluarga', 'pintu-dapur', 'dapur']);
    walker.advance(16);
    const step = Math.hypot(walker.position[0] - midway[0], walker.position[1] - midway[1]);
    expect(step).toBeCloseTo((SPEED * 16) / 1000, 5);
    expect(walkUntilArrival(walker).room).toBe('dapur');
  });

  it('turns back when the room behind her is closer than the one ahead', () => {
    const walker = new NavWalker(graph, 'dapur', SPEED);
    walker.walkTo('ruang-keluarga');
    walker.advance(50);
    const plan = walker.walkTo('dapur');
    expect(plan?.via).toEqual(['dapur']);
    const { ms } = walkUntilArrival(walker);
    expect(ms).toBeLessThanOrEqual(64);
  });

  it('turns back from a node she has exactly reached without stepping onto the stair', () => {
    // Integer lengths at 400 px/s, so one second lands her exactly on the stair foot.
    const stairs = rawGraph(
      [
        ground('dapur', [0, 0]),
        ground('tangga-bawah', [400, 0], true),
        { id: 'tangga-atas', pos: [400, 400], storey: 1, stair: true },
        { id: 'kantor-papa', pos: [800, 400], storey: 1, stair: false },
      ],
      [
        ['dapur', 'tangga-bawah'],
        ['tangga-bawah', 'tangga-atas'],
        ['tangga-atas', 'kantor-papa'],
      ],
    );
    const walker = new NavWalker(stairs, 'dapur', 400);
    walker.walkTo('kantor-papa');
    walker.advance(1000);
    expect(walker.position).toEqual([400, 0]);

    expect(walker.walkTo('dapur')?.via).toEqual(['dapur']);
    expect(walker.storey).toBe(0);
    walker.advance(16);
    expect(walker.storey).toBe(0);
    expect(walker.onStair).toBe(false);
    expect(walkUntilArrival(walker).room).toBe('dapur');
  });

  it('keeps walking when the new room cannot be reached', () => {
    const island = rawGraph(graph.nodes.values(), [['dapur', 'pintu-dapur']]);
    const walker = new NavWalker(island, 'dapur', SPEED);
    expect(walker.walkTo('kamar-tidur')).toBeUndefined();
    expect(walker.walking).toBe(false);
    walker.walkTo('dapur');
    expect(walker.walkTo('kamar-tidur')).toBeUndefined();
    expect(walker.room).toBe('dapur');
  });

  it('ignores negative frame times', () => {
    const walker = new NavWalker(graph, 'ruang-keluarga', SPEED);
    walker.walkTo('dapur');
    walker.advance(-500);
    expect(walker.position).toEqual(posOf('ruang-keluarga'));
  });
});
