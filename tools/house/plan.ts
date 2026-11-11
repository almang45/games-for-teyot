import { z } from 'zod';
import { duplicates, error, kebabId, schemaRef, type Issue } from '../../contracts/common.ts';
import { activity, roomId, STOREYS, storey, type Storey } from '../../contracts/rooms.ts';

/**
 * The floor plan `npm run house:blockout` reads (US-REF-02), in metres. x runs along the plan's
 * long axis and y across it; the camera looks from the +x +y corner, so x0 and y0 are the back
 * edges of an area and the front edges stay open (the dollhouse cutaway, ASSETS.md §4.1).
 * The real plan lives in `reference/rumah/denah/` and is never committed.
 */
const metres = z.number();
const length = metres.positive();

/** [x, y] on the plan. */
export const planPoint = z.tuple([metres, metres]);
export type PlanPoint = z.infer<typeof planPoint>;

/** [x, y, width along x, depth along y]. */
export const planRect = z.tuple([metres, metres, length, length]);
export type PlanRect = z.infer<typeof planRect>;

/** A back wall: x0 is the wall along the area's x = x0 edge, y0 the one along y = y0. */
export const wallSide = z.enum(['x0', 'y0']);
export type WallSide = z.infer<typeof wallSide>;

export const planArea = z.strictObject({
  id: kebabId,
  storey,
  /** Floor level; defaults to the storey's FFL. Terraces and gardens sit a step lower. */
  z: metres.optional(),
  rect: planRect,
  /** Back walls to draw. Front walls are always cut away. */
  walls: z.array(wallSide).default([]),
  /** Defaults to the plan's `wallHeight`. */
  wallHeight: length.optional(),
  outdoor: z.boolean().default(false),
});
export type PlanArea = z.infer<typeof planArea>;

export const planDoor = z.strictObject({
  area: kebabId,
  wall: wallSide,
  /** Distance from the wall's start (the area's x0 or y0 corner) to the door's near jamb. */
  at: metres.nonnegative(),
  width: length,
  height: length.default(2.1),
});
export type PlanDoor = z.infer<typeof planDoor>;

/** One straight flight; `rise` is the direction you walk while climbing. */
export const planStair = z.strictObject({
  id: kebabId,
  /** The storey the flight is drawn with; the one it starts from. */
  storey,
  rect: planRect,
  rise: z.enum(['+x', '-x', '+y', '-y']),
  from: metres,
  to: metres,
  steps: z.number().int().positive(),
});
export type PlanStair = z.infer<typeof planStair>;

export const planRoom = z.strictObject({
  id: roomId,
  /** The area that is this room's floor. */
  area: kebabId,
  activities: z.array(activity),
  stand: planPoint,
  parking: z.strictObject({ bubu: planPoint, ocica: planPoint }),
  /** Walkable floor; defaults to the area minus `walkInset` along its walls. */
  walk: planRect.optional(),
});
export type PlanRoom = z.infer<typeof planRoom>;

/** A rectangle on a back wall of the room's area, e.g. the fridge door. */
export const planSpot = z.strictObject({
  room: roomId,
  wall: wallSide,
  at: metres.nonnegative(),
  width: length,
  /** Height of the bottom edge above the floor. */
  bottom: metres.nonnegative(),
  height: length,
  /** Distance in front of the wall, for furniture against it: the fridge door, not the wall. */
  offset: metres.nonnegative().default(0),
});
export type PlanSpot = z.infer<typeof planSpot>;

export const planWaypoint = z.strictObject({
  id: kebabId,
  at: planPoint,
  storey,
  /** Height on a flight or landing; defaults to the storey's FFL. */
  z: metres.optional(),
  stair: z.boolean().optional(),
});
export type PlanWaypoint = z.infer<typeof planWaypoint>;

export const floorPlan = z.strictObject({
  $schema: schemaRef,
  wallHeight: length.default(2.4),
  /** Floor slab thickness, drawn as the front faces of every area. */
  slab: length.default(0.2),
  /** How far the default walk polygon keeps from a back wall. */
  walkInset: metres.nonnegative().default(0.3),
  /** Empty border kept around the house on the 3840 × 2400 canvas, in px. */
  marginPx: z.number().int().nonnegative().default(160),
  areas: z.array(planArea).min(1),
  doors: z.array(planDoor).default([]),
  stairs: z.array(planStair).default([]),
  rooms: z.array(planRoom).min(1),
  spots: z.strictObject({ fridge: planSpot, 'sticker-wall': planSpot }),
  waypoints: z.array(planWaypoint).default([]),
  edges: z.array(z.tuple([kebabId, kebabId])).default([]),
  start: roomId,
});
export type FloorPlan = z.infer<typeof floorPlan>;

/** Point equality slack in metres: plans are typed by hand from the denah. */
const EPS = 1e-6;

export const floorZ = (a: PlanArea): number => a.z ?? ffl(a.storey);

export const ffl = (s: Storey): number => STOREYS[s].ffl;

export const wallHeightOf = (plan: FloorPlan, a: PlanArea): number =>
  a.wallHeight ?? plan.wallHeight;

/** Length of a back wall: x0 runs along y, y0 along x. */
export const wallLength = (a: PlanArea, side: WallSide): number =>
  side === 'x0' ? a.rect[3] : a.rect[2];

export const inPlanRect = ([px, py]: PlanPoint, [x, y, w, d]: PlanRect): boolean =>
  px >= x - EPS && px <= x + w + EPS && py >= y - EPS && py <= y + d + EPS;

/** The area minus `inset` along each of its back walls. */
export function defaultWalk(a: PlanArea, inset: number): PlanRect {
  const [x, y, w, d] = a.rect;
  const dx = a.walls.includes('x0') ? inset : 0;
  const dy = a.walls.includes('y0') ? inset : 0;
  return [x + dx, y + dy, w - dx, d - dy];
}

export const walkOf = (plan: FloorPlan, room: PlanRoom, a: PlanArea): PlanRect =>
  room.walk ?? defaultWalk(a, plan.walkInset);

function checkOnWall(
  a: PlanArea,
  side: WallSide,
  span: { at: number; width: number; bottom: number; height: number },
  path: string,
  wallHeight: number,
): Issue[] {
  const issues: Issue[] = [];
  if (!a.walls.includes(side)) issues.push(error(`${path}.wall`, `${a.id} has no ${side} wall`));
  if (span.at + span.width > wallLength(a, side) + EPS) {
    issues.push(error(path, `runs past the end of the ${side} wall of ${a.id}`));
  }
  if (span.bottom + span.height > wallHeight + EPS) {
    issues.push(error(path, `is taller than the ${side} wall of ${a.id}`));
  }
  return issues;
}

function checkRoom(plan: FloorPlan, room: PlanRoom, i: number, a: PlanArea | undefined): Issue[] {
  const path = `rooms[${i}]`;
  if (!a) return [error(`${path}.area`, `unknown area ${room.area}`)];
  const issues: Issue[] = [];
  const walk = walkOf(plan, room, a);
  const [wx, wy, ww, wd] = walk;
  if (walk[2] <= 0 || walk[3] <= 0) issues.push(error(`${path}.walk`, 'walk has no area'));
  if (!inPlanRect([wx, wy], a.rect) || !inPlanRect([wx + ww, wy + wd], a.rect)) {
    issues.push(error(`${path}.walk`, `walk leaves area ${a.id}`));
  }
  const points: [string, PlanPoint][] = [
    ['stand', room.stand],
    ['parking.bubu', room.parking.bubu],
    ['parking.ocica', room.parking.ocica],
  ];
  for (const [name, p] of points) {
    if (!inPlanRect(p, walk)) issues.push(error(`${path}.${name}`, 'must lie inside the walk'));
  }
  return issues;
}

/** Plan rules the schema can't express. Errors here stop the blockout. */
export function checkPlan(plan: FloorPlan): Issue[] {
  const issues: Issue[] = [];
  const areas = new Map(plan.areas.map((a) => [a.id, a]));
  for (const dupe of duplicates(plan.areas.map((a) => a.id))) {
    issues.push(error('areas', `duplicate area ${dupe}`));
  }
  for (const dupe of duplicates(plan.stairs.map((s) => s.id))) {
    issues.push(error('stairs', `duplicate stair ${dupe}`));
  }
  for (const dupe of duplicates(plan.rooms.map((r) => r.id))) {
    issues.push(error('rooms', `duplicate room ${dupe}`));
  }
  for (const dupe of duplicates(plan.rooms.map((r) => r.area))) {
    issues.push(error('rooms', `area ${dupe} is the floor of more than one room`));
  }
  plan.rooms.forEach((r, i) => issues.push(...checkRoom(plan, r, i, areas.get(r.area))));
  plan.doors.forEach((door, i) => {
    const a = areas.get(door.area);
    if (!a) {
      issues.push(error(`doors[${i}].area`, `unknown area ${door.area}`));
      return;
    }
    const span = { at: door.at, width: door.width, bottom: 0, height: door.height };
    issues.push(...checkOnWall(a, door.wall, span, `doors[${i}]`, wallHeightOf(plan, a)));
  });
  plan.stairs.forEach((s, i) => {
    if (s.from === s.to) issues.push(error(`stairs[${i}]`, 'a flight must climb: from equals to'));
  });
  for (const [name, spot] of Object.entries(plan.spots)) {
    const room = plan.rooms.find((r) => r.id === spot.room);
    const a = room && areas.get(room.area);
    if (!a) {
      issues.push(error(`spots.${name}.room`, `${spot.room} is not in rooms`));
      continue;
    }
    issues.push(...checkOnWall(a, spot.wall, spot, `spots.${name}`, wallHeightOf(plan, a)));
    const depth = spot.wall === 'x0' ? a.rect[2] : a.rect[3];
    if (spot.offset >= depth) {
      issues.push(error(`spots.${name}.offset`, `stands outside area ${a.id}`));
    }
  }
  return issues;
}
