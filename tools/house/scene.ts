import type { Storey } from '../../contracts/rooms.ts';
import type { Vec3 } from './iso.ts';
import {
  floorZ,
  wallHeightOf,
  type FloorPlan,
  type PlanArea,
  type PlanRect,
  type PlanStair,
} from './plan.ts';

/** Draw order inside one storey: floors, then the back walls, their openings, then the stairs. */
export const LAYERS = ['floors', 'walls', 'doors', 'stairs'] as const;
export type Layer = (typeof LAYERS)[number];

export type FaceKind =
  'floor' | 'slab-x' | 'slab-y' | 'wall-x0' | 'wall-y0' | 'door' | 'step' | 'step-x' | 'step-y';

/** One flat polygon of the blockout, in plan metres. */
export interface Face {
  readonly layer: Layer;
  readonly kind: FaceKind;
  readonly storey: Storey;
  readonly outdoor: boolean;
  /** The area or stair it belongs to. */
  readonly owner: string;
  readonly points: readonly Vec3[];
}

/** A solid that can hide what is behind it from the camera. */
export type Occluder =
  | {
      readonly kind: 'slab';
      readonly owner: string;
      readonly rect: PlanRect;
      readonly bottom: number;
      readonly top: number;
    }
  | {
      readonly kind: 'wall';
      readonly owner: string;
      readonly side: 'x0' | 'y0';
      /** The wall's plane: x for x0, y for y0. */
      readonly at: number;
      /** Extent along the wall. */
      readonly from: number;
      readonly to: number;
      readonly bottom: number;
      readonly top: number;
    };

/** The plane x = `x`, from y0 to y1 and z0 to z1. */
export const quadX = (x: number, y0: number, y1: number, z0: number, z1: number): Vec3[] => [
  { x, y: y0, z: z0 },
  { x, y: y1, z: z0 },
  { x, y: y1, z: z1 },
  { x, y: y0, z: z1 },
];

/** The plane y = `y`, from x0 to x1 and z0 to z1. */
export const quadY = (y: number, x0: number, x1: number, z0: number, z1: number): Vec3[] => [
  { x: x0, y, z: z0 },
  { x: x1, y, z: z0 },
  { x: x1, y, z: z1 },
  { x: x0, y, z: z1 },
];

/** A horizontal rect at height z. */
export const quadZ = (z: number, [x, y, w, d]: PlanRect): Vec3[] => [
  { x, y, z },
  { x: x + w, y, z },
  { x: x + w, y: y + d, z },
  { x, y: y + d, z },
];

export interface Step {
  readonly rect: PlanRect;
  readonly top: number;
}

/** The treads of a flight, first step first. */
export function stepsOf(s: PlanStair): Step[] {
  const [x, y, w, d] = s.rect;
  const rise = (s.to - s.from) / s.steps;
  return Array.from({ length: s.steps }, (_, i): Step => {
    const lo = i / s.steps;
    const hi = (i + 1) / s.steps;
    const rects: Record<PlanStair['rise'], PlanRect> = {
      '+x': [x + w * lo, y, w / s.steps, d],
      '-x': [x + w * (1 - hi), y, w / s.steps, d],
      '+y': [x, y + d * lo, w, d / s.steps],
      '-y': [x, y + d * (1 - hi), w, d / s.steps],
    };
    return { rect: rects[s.rise], top: s.from + rise * (i + 1) };
  });
}

const stairBase = (s: PlanStair): number => Math.min(s.from, s.to);

function areaFaces(plan: FloorPlan, a: PlanArea): Face[] {
  const z = floorZ(a);
  const [x, y, w, d] = a.rect;
  const h = wallHeightOf(plan, a);
  const base = { storey: a.storey, outdoor: a.outdoor, owner: a.id };
  const faces: Face[] = [
    { ...base, layer: 'floors', kind: 'floor', points: quadZ(z, a.rect) },
    { ...base, layer: 'floors', kind: 'slab-x', points: quadX(x + w, y, y + d, z - plan.slab, z) },
    { ...base, layer: 'floors', kind: 'slab-y', points: quadY(y + d, x, x + w, z - plan.slab, z) },
  ];
  if (a.walls.includes('x0')) {
    faces.push({ ...base, layer: 'walls', kind: 'wall-x0', points: quadX(x, y, y + d, z, z + h) });
  }
  if (a.walls.includes('y0')) {
    faces.push({ ...base, layer: 'walls', kind: 'wall-y0', points: quadY(y, x, x + w, z, z + h) });
  }
  return faces;
}

function stairFaces(s: PlanStair): Face[] {
  const base = { storey: s.storey, outdoor: false, owner: s.id, layer: 'stairs' as const };
  const z0 = stairBase(s);
  return stepsOf(s).flatMap(({ rect, top }): Face[] => {
    const [x, y, w, d] = rect;
    return [
      { ...base, kind: 'step', points: quadZ(top, rect) },
      { ...base, kind: 'step-x', points: quadX(x + w, y, y + d, z0, top) },
      { ...base, kind: 'step-y', points: quadY(y + d, x, x + w, z0, top) },
    ];
  });
}

/** Every face of the blockout, unsorted. */
export function buildFaces(plan: FloorPlan): Face[] {
  const areas = new Map(plan.areas.map((a) => [a.id, a]));
  const doors = plan.doors.flatMap((door): Face[] => {
    const a = areas.get(door.area);
    if (!a) return [];
    const z = floorZ(a);
    const [x, y] = a.rect;
    const points =
      door.wall === 'x0'
        ? quadX(x, y + door.at, y + door.at + door.width, z, z + door.height)
        : quadY(y, x + door.at, x + door.at + door.width, z, z + door.height);
    return [
      { layer: 'doors', kind: 'door', storey: a.storey, outdoor: false, owner: a.id, points },
    ];
  });
  return [
    ...plan.areas.flatMap((a) => areaFaces(plan, a)),
    ...doors,
    ...plan.stairs.flatMap(stairFaces),
  ];
}

/** Painter's order: storey by storey, layer by layer, then back to front. */
export function sortFaces(faces: readonly Face[]): Face[] {
  const depth = (f: Face): number =>
    f.points.reduce((sum, p) => sum + p.x + p.y + p.z * 1e-3, 0) / f.points.length;
  const layer = (f: Face): number => LAYERS.indexOf(f.layer);
  return [...faces].sort(
    (a, b) => a.storey - b.storey || layer(a) - layer(b) || depth(a) - depth(b),
  );
}

/** The solids that can hide floor from the camera: slabs, back walls and stair steps. */
export function buildOccluders(plan: FloorPlan): Occluder[] {
  const out: Occluder[] = [];
  for (const a of plan.areas) {
    const z = floorZ(a);
    const [x, y, w, d] = a.rect;
    const top = z + wallHeightOf(plan, a);
    out.push({ kind: 'slab', owner: a.id, rect: a.rect, bottom: z - plan.slab, top: z });
    if (a.walls.includes('x0')) {
      out.push({
        kind: 'wall',
        owner: a.id,
        side: 'x0',
        at: x,
        from: y,
        to: y + d,
        bottom: z,
        top,
      });
    }
    if (a.walls.includes('y0')) {
      out.push({
        kind: 'wall',
        owner: a.id,
        side: 'y0',
        at: y,
        from: x,
        to: x + w,
        bottom: z,
        top,
      });
    }
  }
  for (const s of plan.stairs) {
    const bottom = stairBase(s);
    for (const step of stepsOf(s)) {
      out.push({ kind: 'slab', owner: s.id, rect: step.rect, bottom, top: step.top });
    }
  }
  return out;
}
