import { z } from 'zod';
import {
  assetKey,
  duplicates,
  error,
  kebabId,
  point,
  polygon,
  rect,
  rectContains,
  rectContainsPoint,
  schemaRef,
  version,
  type Issue,
  type Point,
  type Rect,
} from './common.ts';
import { pointInPolygon, polygonArea, sampleSegment, selfIntersects } from './geometry.ts';
import { activity, roomId, storey, type Storey } from './rooms.ts';

/** layout.json coordinates: the 1920 × 1200 house export space (ASSETS.md §4.2). */
export const HOUSE_SIZE = [1920, 1200] as const;

/** Edges are checked against the walkable floor every this many px. */
const EDGE_SAMPLE_PX = 8;

export const houseRoom = z.strictObject({
  id: roomId,
  /** What the room hosts; empty for rooms that are only decoration so far. */
  activities: z.array(activity),
  /** Tap area in screen space. */
  polygon,
  /** Walkable floor (an isometric diamond, usually). */
  walk: polygon,
  /** Theia's feet on arrival. */
  stand: point,
  storey,
  /** Camera zoom rect for the room scene. */
  focus: rect,
  /** Where Bubu and Ocica wait while Theia is in the room (design brief §3, SCR-HOUSE). */
  parking: z.strictObject({ bubu: point, ocica: point }),
});
export type HouseRoom = z.infer<typeof houseRoom>;

export const houseSpot = z.strictObject({
  room: roomId,
  /** Where the game places the content: finished pages, the sticker. */
  rect,
});

export const houseLayout = z.strictObject({
  $schema: schemaRef,
  version,
  size: z.tuple([z.literal(HOUSE_SIZE[0]), z.literal(HOUSE_SIZE[1])]),
  rooms: z.array(houseRoom).min(1),
  spots: z.strictObject({
    /** Finished coloring pages hang here (PRD US-COLOR). */
    fridge: houseSpot,
    /** Her sticker wall; empty in M1, placed for M2. */
    'sticker-wall': houseSpot,
  }),
  occluders: z.array(
    z.strictObject({
      key: assetKey.regex(/^house\.occluders\./, 'occluder keys start with house.occluders.'),
      /** Drawn in front of characters whose feet are above this line (smaller y). */
      sortY: z.number(),
    }),
  ),
  waypoints: z.array(
    z.strictObject({
      id: kebabId,
      pos: point,
      storey,
      /** On a stair run: may sit outside the floor polygons. */
      stair: z.boolean().optional(),
    }),
  ),
  /** Undirected; a room node stands at its `stand` point. */
  edges: z.array(z.tuple([kebabId, kebabId])),
  start: roomId,
});
export type HouseLayout = z.infer<typeof houseLayout>;

interface GraphNode {
  readonly pos: Point;
  readonly storey: Storey;
  readonly stair: boolean;
}

const FRAME_RECT: Rect = [0, 0, HOUSE_SIZE[0], HOUSE_SIZE[1]];

function checkPolygon(poly: Point[], path: string): Issue[] {
  const issues: Issue[] = [];
  if (polygonArea(poly) === 0) issues.push(error(path, 'polygon has no area'));
  if (selfIntersects(poly)) issues.push(error(path, 'polygon edges cross'));
  if (!poly.every((p) => rectContainsPoint(FRAME_RECT, p))) {
    issues.push(error(path, 'polygon leaves the 1920 × 1200 canvas'));
  }
  return issues;
}

function checkRoom(room: HouseRoom, i: number): Issue[] {
  const path = `rooms[${i}]`;
  const issues = [
    ...checkPolygon(room.polygon, `${path}.polygon`),
    ...checkPolygon(room.walk, `${path}.walk`),
  ];
  if (!pointInPolygon(room.stand, room.walk)) {
    issues.push(error(`${path}.stand`, 'stand must lie inside the walk polygon'));
  }
  for (const who of ['bubu', 'ocica'] as const) {
    if (!pointInPolygon(room.parking[who], room.walk)) {
      issues.push(error(`${path}.parking.${who}`, 'parking spot must lie inside the walk polygon'));
    }
  }
  if (!rectContains(FRAME_RECT, room.focus)) {
    issues.push(error(`${path}.focus`, 'focus rect leaves the canvas'));
  }
  return issues;
}

function onFloor(p: Point, s: Storey, layout: HouseLayout): boolean {
  return layout.rooms.some((r) => r.storey === s && pointInPolygon(p, r.walk));
}

function checkGraph(layout: HouseLayout): Issue[] {
  const issues: Issue[] = [];
  const nodes = new Map<string, GraphNode>();
  for (const r of layout.rooms) nodes.set(r.id, { pos: r.stand, storey: r.storey, stair: false });
  layout.waypoints.forEach((w, i) => {
    nodes.set(w.id, { pos: w.pos, storey: w.storey, stair: w.stair === true });
    if (w.stair !== true && !onFloor(w.pos, w.storey, layout)) {
      issues.push(
        error(`waypoints[${i}].pos`, `${w.id} is off the walkable floor of storey ${w.storey}`),
      );
    }
  });

  const adjacency = new Map<string, string[]>([...nodes.keys()].map((id) => [id, []]));
  layout.edges.forEach(([a, b], i) => {
    const path = `edges[${i}]`;
    const from = nodes.get(a);
    const to = nodes.get(b);
    if (!from || !to) {
      issues.push(error(path, `unknown node ${from ? b : a}`));
      return;
    }
    if (a === b) issues.push(error(path, 'edge connects a node to itself'));
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
    const climbs = from.storey !== to.storey;
    if (climbs && !(from.stair && to.stair)) {
      issues.push(error(path, 'an edge between storeys must join two stair waypoints'));
    }
    if (!climbs && !(from.stair && to.stair)) {
      const off = sampleSegment(from.pos, to.pos, EDGE_SAMPLE_PX).some(
        (p) => !onFloor(p, from.storey, layout),
      );
      if (off) issues.push(error(path, `${a} → ${b} leaves the walkable floor`));
    }
  });

  const reached = new Set<string>([layout.start]);
  const queue: string[] = [layout.start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const next of adjacency.get(id) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  for (const r of layout.rooms) {
    if (!reached.has(r.id))
      issues.push(error('edges', `${r.id} is not reachable from ${layout.start}`));
  }
  return issues;
}

/** ASSETS.md §4.2 rules the schema can't express. */
export function checkHouseLayout(layout: HouseLayout): Issue[] {
  const issues: Issue[] = [];
  const ids = [...layout.rooms.map((r) => r.id), ...layout.waypoints.map((w) => w.id)];
  const dupeIds = duplicates(ids);
  for (const dupe of dupeIds) issues.push(error('rooms', `duplicate node id ${dupe}`));
  const activities = layout.rooms.flatMap((r) => r.activities);
  for (const dupe of duplicates(activities)) {
    issues.push(error('rooms', `${dupe} is hosted by more than one room`));
  }
  for (const dupe of duplicates(layout.occluders.map((o) => o.key))) {
    issues.push(error('occluders', `duplicate occluder ${dupe}`));
  }
  const hasStart = layout.rooms.some((r) => r.id === layout.start);
  if (!hasStart) issues.push(error('start', `start room ${layout.start} is not in rooms`));
  layout.rooms.forEach((r, i) => issues.push(...checkRoom(r, i)));
  for (const [name, spot] of Object.entries(layout.spots)) {
    const room = layout.rooms.find((r) => r.id === spot.room);
    if (!room) issues.push(error(`spots.${name}.room`, `${spot.room} is not in rooms`));
    if (!rectContains(FRAME_RECT, spot.rect)) {
      issues.push(error(`spots.${name}.rect`, 'spot leaves the canvas'));
    }
  }
  // The graph walk needs unambiguous nodes and a start to walk from.
  if (dupeIds.length === 0 && hasStart) issues.push(...checkGraph(layout));
  return issues;
}
