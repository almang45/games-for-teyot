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

/**
 * One piece of furniture or decor: a box in an area, drawn as its own sprite,
 * `house.props.<area>.<id>` (ASSETS.md §4.1).
 */
export const planFurniture = z.strictObject({
  id: kebabId,
  area: kebabId,
  /** Footprint on the plan, on the grid and inside its area. */
  rect: planRect,
  height: length,
  /** Gap under it, for what hangs on a wall: a TV, wall cabinets. */
  lift: metres.nonnegative().default(0),
});
export type PlanFurniture = z.infer<typeof planFurniture>;

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
  /**
   * Cell size in metres. Walls, doors, stairs and spots sit on it, so art and furniture can be
   * measured in whole cells; 20 cm fits standard furniture (60, 80, 120, 160, 200 cm).
   */
  grid: length.default(0.2),
  /** Empty border kept around the house on the 3840 × 2400 canvas, in px. */
  marginPx: z.number().int().nonnegative().default(160),
  areas: z.array(planArea).min(1),
  doors: z.array(planDoor).default([]),
  stairs: z.array(planStair).default([]),
  rooms: z.array(planRoom).min(1),
  spots: z.strictObject({ fridge: planSpot, 'sticker-wall': planSpot }),
  furniture: z.array(planFurniture).default([]),
  waypoints: z.array(planWaypoint).default([]),
  edges: z.array(z.tuple([kebabId, kebabId])).default([]),
  start: roomId,
});
export type FloorPlan = z.infer<typeof floorPlan>;

/** Point equality slack in metres: plans are typed by hand from the denah. */
const EPS = 1e-6;

/** Stands and parking keep this far inside the walk, so a rounded px never lands on its edge. */
export const STAND_MARGIN = 0.05;

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

/** True when `v` is a whole number of `grid` cells, to the plan's slack. */
export const onGrid = (v: number, grid: number): boolean =>
  Math.abs(v / grid - Math.round(v / grid)) * grid < EPS;

/** Everything that has to land on a grid line; heights and room points stay free. */
function gridIssues(plan: FloorPlan): Issue[] {
  const g = plan.grid;
  const edges = ([x, y, w, d]: PlanRect): [string, number][] => [
    ['x', x],
    ['y', y],
    ['x + width', x + w],
    ['y + depth', y + d],
  ];
  const checks: [string, [string, number][]][] = [
    ...plan.areas.map((a, i): [string, [string, number][]] => [`areas[${i}].rect`, edges(a.rect)]),
    ...plan.stairs.map((s, i): [string, [string, number][]] => [
      `stairs[${i}].rect`,
      edges(s.rect),
    ]),
    ...plan.furniture.map((f, i): [string, [string, number][]] => [
      `furniture[${i}].rect`,
      edges(f.rect),
    ]),
    ...plan.doors.map((door, i): [string, [string, number][]] => [
      `doors[${i}]`,
      [
        ['at', door.at],
        ['width', door.width],
      ],
    ]),
    ...Object.entries(plan.spots).map(([name, spot]): [string, [string, number][]] => [
      `spots.${name}`,
      [
        ['at', spot.at],
        ['width', spot.width],
        ['offset', spot.offset],
      ],
    ]),
  ];
  const mm = (v: number): number => Math.round(v * 1000) / 1000;
  return checks.flatMap(([path, values]) =>
    values
      .filter(([, v]) => !onGrid(v, g))
      .map(([name, v]) => {
        const nearest = mm(Math.round(v / g) * g);
        return error(
          path,
          `${name} ${mm(v)} is off the ${mm(g * 100)} cm grid; nearest ${nearest}`,
        );
      }),
  );
}

/** The manifest key segment of a piece: `<area>.<id>`. */
export const furnitureName = (f: PlanFurniture): string => `${f.area}.${f.id}`;

type Span = readonly [number, number];

const spansOverlap = ([a0, a1]: Span, [b0, b1]: Span): boolean =>
  Math.min(a1, b1) - Math.max(a0, b0) > EPS;

function checkFurniture(plan: FloorPlan, areas: ReadonlyMap<string, PlanArea>): Issue[] {
  const issues: Issue[] = [];
  for (const dupe of duplicates(plan.furniture.map(furnitureName))) {
    issues.push(error('furniture', `duplicate piece ${dupe}`));
  }
  const placed: { name: string; spans: [Span, Span, Span] }[] = [];
  plan.furniture.forEach((f, i) => {
    const path = `furniture[${i}]`;
    const a = areas.get(f.area);
    if (!a) {
      issues.push(error(`${path}.area`, `unknown area ${f.area}`));
      return;
    }
    const [x, y, w, d] = f.rect;
    if (!inPlanRect([x, y], a.rect) || !inPlanRect([x + w, y + d], a.rect)) {
      issues.push(error(`${path}.rect`, `leaves area ${a.id}`));
    }
    if (f.lift + f.height > wallHeightOf(plan, a) + EPS) {
      issues.push(error(path, `is taller than the walls of ${a.id}`));
    }
    const z = floorZ(a) + f.lift;
    const spans: [Span, Span, Span] = [
      [x, x + w],
      [y, y + d],
      [z, z + f.height],
    ];
    const hit = placed.find((p) => p.spans.every((s, k) => spansOverlap(s, spans[k] ?? s)));
    if (hit) issues.push(error(path, `overlaps ${hit.name}`));
    placed.push({ name: furnitureName(f), spans });
  });
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
  const m = STAND_MARGIN;
  const inner: PlanRect = [wx + m, wy + m, ww - 2 * m, wd - 2 * m];
  for (const [name, p] of points) {
    if (!inPlanRect(p, inner)) {
      issues.push(error(`${path}.${name}`, `must lie at least ${m * 100} cm inside the walk`));
    }
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
  issues.push(...gridIssues(plan));
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
  issues.push(...checkFurniture(plan, areas));
  plan.stairs.forEach((s, i) => {
    if (s.from >= s.to) {
      issues.push(error(`stairs[${i}]`, 'a flight climbs along rise: from must be below to'));
    }
  });
  for (const [name, spot] of Object.entries(plan.spots)) {
    const room = plan.rooms.find((r) => r.id === spot.room);
    if (!room) {
      issues.push(error(`spots.${name}.room`, `${spot.room} is not in rooms`));
      continue;
    }
    // A room without its area is already reported under rooms[].
    const a = areas.get(room.area);
    if (!a) continue;
    issues.push(...checkOnWall(a, spot.wall, spot, `spots.${name}`, wallHeightOf(plan, a)));
    const depth = spot.wall === 'x0' ? a.rect[2] : a.rect[3];
    if (spot.offset >= depth) {
      issues.push(error(`spots.${name}.offset`, `stands outside area ${a.id}`));
    }
  }
  return issues;
}
