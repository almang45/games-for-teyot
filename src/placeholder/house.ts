import { CONTRACT_VERSION, type Point, type Rect } from '../../contracts/common.ts';
import { HOUSE_SIZE, type HouseLayout, type HouseRoom } from '../../contracts/houseLayout.ts';
import type { Activity, RoomId, Storey } from '../../contracts/rooms.ts';
import { toScreen, type IsoProjection, type WorldPoint } from '../engine/iso/projection.ts';

/**
 * Placeholder house until Antigravity delivers assets/house/layout.json (ASSETS.md §4): a small
 * split-level stand-in with the same contract, so the hub, the nav graph and their tests run on
 * real layout data. World units are floor tiles; `z` is the floor height in tiles.
 */
interface PlaceholderRoom {
  readonly id: RoomId;
  readonly storey: Storey;
  readonly activities: readonly Activity[];
  /** Back corner, then width and depth, in tiles. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
  readonly z: number;
}

interface PlaceholderWaypoint {
  readonly id: string;
  readonly at: WorldPoint;
  readonly storey: Storey;
  readonly stair?: true;
}

const ROOMS: readonly PlaceholderRoom[] = [
  {
    id: 'kamar-tidur',
    storey: 2,
    activities: ['tracing', 'bedtime'],
    x: 0,
    y: 0,
    w: 4,
    d: 4,
    z: 2,
  },
  { id: 'kantor-papa', storey: 1, activities: [], x: 4, y: 0, w: 4, d: 4, z: 1 },
  { id: 'dapur', storey: 0, activities: ['counting'], x: 0, y: 4, w: 4, d: 4, z: 0 },
  {
    id: 'ruang-keluarga',
    storey: 0,
    activities: ['coloring', 'tidy'],
    x: 4,
    y: 4,
    w: 4,
    d: 4,
    z: 0,
  },
];

const WAYPOINTS: readonly PlaceholderWaypoint[] = [
  { id: 'pintu-dapur', at: { x: 4, y: 6, z: 0 }, storey: 0 },
  { id: 'tangga-1-bawah', at: { x: 7, y: 4.5, z: 0 }, storey: 0, stair: true },
  { id: 'tangga-1-atas', at: { x: 7, y: 3.5, z: 1 }, storey: 1, stair: true },
  { id: 'tangga-2-bawah', at: { x: 4.5, y: 1.5, z: 1 }, storey: 1, stair: true },
  { id: 'tangga-2-atas', at: { x: 3.5, y: 1.5, z: 2 }, storey: 2, stair: true },
];

const EDGES: readonly (readonly [string, string])[] = [
  ['dapur', 'pintu-dapur'],
  ['pintu-dapur', 'ruang-keluarga'],
  ['ruang-keluarga', 'tangga-1-bawah'],
  ['tangga-1-bawah', 'tangga-1-atas'],
  ['tangga-1-atas', 'kantor-papa'],
  ['kantor-papa', 'tangga-2-bawah'],
  ['tangga-2-bawah', 'tangga-2-atas'],
  ['tangga-2-atas', 'kamar-tidur'],
];

const START: RoomId = 'ruang-keluarga';
const TILE_WIDTH = 180;
/** Back-wall height above each floor, and the floor slab's thickness, in tiles. */
const WALL_HEIGHT = 1.2;
const SLAB = 0.15;
const FOCUS_PAD = 0.1;

export interface PlaceholderHouse {
  readonly layout: HouseLayout;
  /** Back walls of the cutaway, drawn under the floors. */
  readonly walls: readonly {
    readonly room: RoomId;
    readonly side: 'left' | 'right';
    readonly quad: Point[];
  }[];
  /** Front faces of each floor slab, so the raised storeys read as floors, not decals. */
  readonly slabs: readonly { readonly room: RoomId; readonly quad: Point[] }[];
}

function frameProjection(): IsoProjection {
  const atOrigin: IsoProjection = { tileWidth: TILE_WIDTH, origin: { x: 0, y: 0 } };
  const corners = ROOMS.flatMap((r) => [
    toScreen({ x: r.x, y: r.y, z: r.z + WALL_HEIGHT }, atOrigin),
    toScreen({ x: r.x + r.w, y: r.y, z: r.z + WALL_HEIGHT }, atOrigin),
    toScreen({ x: r.x, y: r.y + r.d, z: r.z + WALL_HEIGHT }, atOrigin),
    toScreen({ x: r.x + r.w, y: r.y + r.d, z: r.z - SLAB }, atOrigin),
    toScreen({ x: r.x, y: r.y + r.d, z: r.z - SLAB }, atOrigin),
    toScreen({ x: r.x + r.w, y: r.y, z: r.z - SLAB }, atOrigin),
  ]);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    tileWidth: TILE_WIDTH,
    origin: { x: Math.round(HOUSE_SIZE[0] / 2 - cx), y: Math.round(HOUSE_SIZE[1] / 2 - cy) },
  };
}

function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

/** The room's bounds with a border, kept on the 1920 × 1200 frame. */
function focusOf(polygon: readonly Point[]): Rect {
  const [x, y, w, h] = boundsOf(polygon);
  const pad = Math.round(FOCUS_PAD * Math.max(w, h));
  const x0 = Math.max(0, x - pad);
  const y0 = Math.max(0, y - pad);
  return [
    x0,
    y0,
    Math.min(HOUSE_SIZE[0], x + w + pad) - x0,
    Math.min(HOUSE_SIZE[1], y + h + pad) - y0,
  ];
}

export function buildPlaceholderHouse(): PlaceholderHouse {
  const proj = frameProjection();
  const px = (p: WorldPoint): Point => {
    const s = toScreen(p, proj);
    return [Math.round(s.x), Math.round(s.y)];
  };
  const floorOf = (r: PlaceholderRoom, z = r.z): Point[] => [
    px({ x: r.x, y: r.y, z }),
    px({ x: r.x + r.w, y: r.y, z }),
    px({ x: r.x + r.w, y: r.y + r.d, z }),
    px({ x: r.x, y: r.y + r.d, z }),
  ];
  const lift = (r: PlaceholderRoom, dx: number, dy: number): WorldPoint => ({
    x: r.x + dx,
    y: r.y + dy,
    z: r.z,
  });

  const rooms = ROOMS.map((r): HouseRoom => {
    const floor = floorOf(r);
    return {
      id: r.id,
      activities: [...r.activities],
      polygon: floor,
      walk: floor,
      stand: px(lift(r, r.w / 2, r.d / 2)),
      storey: r.storey,
      focus: focusOf(floor),
      parking: {
        bubu: px(lift(r, r.w / 2 + 0.9, r.d / 2)),
        ocica: px(lift(r, r.w / 2, r.d / 2 + 0.9)),
      },
    };
  });

  const walls: PlaceholderHouse['walls'][number][] = [];
  const slabs: PlaceholderHouse['slabs'][number][] = [];
  for (const r of ROOMS) {
    const top = r.z + WALL_HEIGHT;
    const [back, right, front, left] = floorOf(r);
    const [backTop, rightTop, , leftTop] = floorOf(r, top);
    if (r.x === 0 && back && left && leftTop && backTop) {
      walls.push({ room: r.id, side: 'left', quad: [back, left, leftTop, backTop] });
    }
    if (r.y === 0 && back && right && rightTop && backTop) {
      walls.push({ room: r.id, side: 'right', quad: [back, right, rightTop, backTop] });
    }
    const [, rightBelow, frontBelow, leftBelow] = floorOf(r, r.z - SLAB);
    if (right && front && left && rightBelow && frontBelow && leftBelow) {
      slabs.push({ room: r.id, quad: [left, front, right, rightBelow, frontBelow, leftBelow] });
    }
  }

  const spotOnWall = (r: PlaceholderRoom, side: 'left' | 'right'): Rect => {
    const face =
      side === 'left'
        ? [px({ x: r.x, y: r.y + 1, z: r.z + 0.3 }), px({ x: r.x, y: r.y + 2, z: r.z + 1 })]
        : [px({ x: r.x + 1, y: r.y, z: r.z + 0.3 }), px({ x: r.x + 2, y: r.y, z: r.z + 1 })];
    return boundsOf(face);
  };
  const roomById = (id: RoomId): PlaceholderRoom => {
    const r = ROOMS.find((room) => room.id === id);
    if (!r) throw new Error(`placeholder house has no ${id}`);
    return r;
  };

  const layout: HouseLayout = {
    version: CONTRACT_VERSION,
    size: [HOUSE_SIZE[0], HOUSE_SIZE[1]],
    rooms,
    spots: {
      fridge: { room: 'dapur', rect: spotOnWall(roomById('dapur'), 'left') },
      'sticker-wall': { room: 'kamar-tidur', rect: spotOnWall(roomById('kamar-tidur'), 'right') },
    },
    occluders: [],
    props: [],
    waypoints: WAYPOINTS.map((w) => ({
      id: w.id,
      pos: px(w.at),
      storey: w.storey,
      ...(w.stair ? { stair: true } : {}),
    })),
    edges: EDGES.map(([a, b]) => [a, b]),
    start: START,
  };
  return { layout, walls, slabs };
}
