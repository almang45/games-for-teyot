import { CONTRACT_VERSION, warning, type Issue, type Point } from '../../contracts/common.ts';
import {
  HOUSE_SIZE,
  type HouseLayout,
  type HouseProp,
  type HouseRoom,
} from '../../contracts/houseLayout.ts';
import { boundsOf, focusRect } from '../../src/engine/camera/focus.ts';
import { convexHull, project, type Fit, type Vec3 } from './iso.ts';
import {
  ffl,
  floorZ,
  furnitureName,
  inPlanRect,
  walkOf,
  wallHeightOf,
  type FloorPlan,
  type PlanArea,
  type PlanFurniture,
  type PlanPoint,
  type PlanSpot,
  type PlanWaypoint,
} from './plan.ts';
import { isProp, quadX, quadY, quadZ, type Solid } from './scene.ts';
import { hiddenBy, hiddenQuad } from './visibility.ts';

/** The blockout canvas: the 1920 × 1200 layout space at 2× (ASSETS.md §4.1). */
export const CANVAS: readonly [number, number] = [HOUSE_SIZE[0] * 2, HOUSE_SIZE[1] * 2];

/** Layout coordinates are whole pixels, like hand-placed JSON. */
const toLayout = (p: Vec3, fit: Fit): Point => {
  const [x, y] = project(p, fit);
  return [Math.round(x / 2), Math.round(y / 2)];
};

const at = (p: PlanPoint, z: number): Vec3 => ({ x: p[0], y: p[1], z });

/** Floor plus the tops of its back walls: what a tap on the room should hit. */
function tapPolygon(plan: FloorPlan, a: PlanArea, fit: Fit): Point[] {
  const z = floorZ(a);
  const [x, y, w, d] = a.rect;
  const top = z + wallHeightOf(plan, a);
  const corners: Vec3[] = [...quadZ(z, a.rect)];
  if (a.walls.includes('x0')) corners.push({ x, y, z: top }, { x, y: y + d, z: top });
  if (a.walls.includes('y0')) corners.push({ x, y, z: top }, { x: x + w, y, z: top });
  return convexHull(corners.map((p) => toLayout(p, fit)));
}

function spotFace(spot: PlanSpot, a: PlanArea): Vec3[] {
  const z = floorZ(a) + spot.bottom;
  const [x, y] = a.rect;
  return spot.wall === 'x0'
    ? quadX(x + spot.offset, y + spot.at, y + spot.at + spot.width, z, z + spot.height)
    : quadY(y + spot.offset, x + spot.at, x + spot.at + spot.width, z, z + spot.height);
}

/** The manifest's largest image side (house.props), in source px at 2×. */
const PROP_MAX_SOURCE_PX = 1024;

/**
 * A piece's sprite rect and footprint. The footprint is the box's underside: on the floor for
 * what stands, at its lift for what hangs on a wall, so the sprite stays trimmed.
 */
function propOf(
  f: PlanFurniture,
  a: PlanArea,
  fit: Fit,
  room: HouseProp['room'],
): { prop: HouseProp; issues: Issue[] } {
  const z0 = floorZ(a) + f.lift;
  const base = quadZ(z0, f.rect);
  const top = quadZ(z0 + f.height, f.rect);
  const rect = boundsOf([...base, ...top].map((p) => toLayout(p, fit)));
  const issues: Issue[] = [];
  const [w, h] = [rect[2] * 2, rect[3] * 2];
  const [b0, b1, b2, b3] = base;
  if (Math.max(w, h) > PROP_MAX_SOURCE_PX) {
    issues.push(
      warning(
        `furniture.${furnitureName(f)}`,
        `the sprite would be ${w} × ${h} px, over the ${PROP_MAX_SOURCE_PX} px limit: split it`,
      ),
    );
  }
  const prop: HouseProp = {
    key: `house.props.${furnitureName(f)}`,
    storey: a.storey,
    ...(room === undefined ? {} : { room }),
    rect,
    base: [toLayout(b0, fit), toLayout(b1, fit), toLayout(b2, fit), toLayout(b3, fit)],
  };
  return { prop, issues };
}

/** Never rounds a sliver to 0 % or a near miss to 100 %. */
export function percent(fraction: number): string {
  const p = Math.round(fraction * 100);
  if (p === 0 && fraction > 0) return '<1%';
  if (p === 100 && fraction < 1) return '>99%';
  return `${p}%`;
}

/** A waypoint's height: given, else the floor of its storey's area under it, else the FFL. */
function waypointZ(plan: FloorPlan, w: PlanWaypoint): number {
  if (w.z !== undefined) return w.z;
  const a = plan.areas.find((area) => area.storey === w.storey && inPlanRect(w.at, area.rect));
  return a ? floorZ(a) : ffl(w.storey);
}

export interface HiddenFloor {
  readonly room: string;
  readonly points: readonly Vec3[];
}

export interface DraftLayout {
  readonly layout: HouseLayout;
  /** Findings about the plan's rooms and spots, as warnings: the draft is still written. */
  readonly issues: readonly Issue[];
  /** Sampled walk floor the camera can't see, per room, for the guide. */
  readonly hidden: readonly HiddenFloor[];
  /** Each room's stand in plan metres, in room order. */
  readonly stands: readonly Vec3[];
}

/**
 * The draft `layout.json` for the blockout drawn with `fit`. Expects a plan that passed checkPlan.
 */
export function draftLayout(plan: FloorPlan, fit: Fit, solids: readonly Solid[]): DraftLayout {
  const areas = new Map(plan.areas.map((a) => [a.id, a]));
  const issues: Issue[] = [];
  const hidden: HiddenFloor[] = [];
  const stands: Vec3[] = [];
  // Characters are depth-sorted with props, so only the house itself can hide a walk.
  const house = solids.filter((s) => !isProp(s));
  const rooms = plan.rooms.map((room, i): HouseRoom => {
    const a = areas.get(room.area);
    if (!a) throw new Error(`rooms[${i}]: unknown area ${room.area}; run checkPlan first`);
    const z = floorZ(a);
    const walk = walkOf(plan, room, a);
    stands.push(at(room.stand, z));
    const covered = hiddenQuad(quadZ(z, walk), house);
    if (covered.points.length > 0) {
      hidden.push({ room: room.id, points: covered.points });
      issues.push(
        warning(
          `rooms[${i}].walk`,
          `${percent(covered.fraction)} of the walk is hidden behind ${covered.by.join(', ')}: ` +
            'trim the walk or plan an occluder',
        ),
      );
    }
    const named: [string, PlanPoint][] = [
      ['stand', room.stand],
      ['parking.bubu', room.parking.bubu],
      ['parking.ocica', room.parking.ocica],
    ];
    for (const [name, p] of named) {
      const o = hiddenBy(at(p, z), solids);
      if (o) issues.push(warning(`rooms[${i}].${name}`, `hidden behind ${o.owner}`));
    }
    const polygon = tapPolygon(plan, a, fit);
    return {
      id: room.id,
      activities: room.activities,
      polygon,
      walk: quadZ(z, walk).map((p) => toLayout(p, fit)),
      stand: toLayout(at(room.stand, z), fit),
      storey: a.storey,
      focus: focusRect(polygon),
      parking: {
        bubu: toLayout(at(room.parking.bubu, z), fit),
        ocica: toLayout(at(room.parking.ocica, z), fit),
      },
    };
  });

  const spot = (name: 'fridge' | 'sticker-wall'): HouseLayout['spots']['fridge'] => {
    const s = plan.spots[name];
    const a = areas.get(plan.rooms.find((r) => r.id === s.room)?.area ?? '');
    if (!a) throw new Error(`spots.${name}: ${s.room} has no area; run checkPlan first`);
    const face = spotFace(s, a);
    // Zoomed into a room, the storeys above it fade out (PRD), so they can't hide its spots.
    const below = solids.filter((solid) => solid.storey <= a.storey);
    const covered = hiddenQuad(face, below);
    if (covered.fraction > 0) {
      issues.push(
        warning(
          `spots.${name}`,
          `${percent(covered.fraction)} hidden behind ${covered.by.join(', ')}`,
        ),
      );
    }
    return { room: s.room, rect: boundsOf(face.map((p) => toLayout(p, fit))) };
  };

  const props = plan.furniture.map((f, i): HouseProp => {
    const a = areas.get(f.area);
    if (!a) throw new Error(`furniture[${i}]: unknown area ${f.area}; run checkPlan first`);
    const room = plan.rooms.find((r) => r.area === f.area)?.id;
    const drafted = propOf(f, a, fit, room);
    issues.push(...drafted.issues);
    return drafted.prop;
  });

  const layout: HouseLayout = {
    version: CONTRACT_VERSION,
    size: [HOUSE_SIZE[0], HOUSE_SIZE[1]],
    rooms,
    spots: { fridge: spot('fridge'), 'sticker-wall': spot('sticker-wall') },
    occluders: [],
    props,
    waypoints: plan.waypoints.map((w) => ({
      id: w.id,
      pos: toLayout(at(w.at, waypointZ(plan, w)), fit),
      storey: w.storey,
      ...(w.stair === undefined ? {} : { stair: w.stair }),
    })),
    edges: plan.edges,
    start: plan.start,
  };
  return { layout, issues, hidden, stands };
}
