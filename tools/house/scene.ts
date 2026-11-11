import type { Storey } from '../../contracts/rooms.ts';
import { depthKey } from '../../src/engine/iso/projection.ts';
import type { Vec3 } from './iso.ts';
import {
  floorZ,
  wallHeightOf,
  type FloorPlan,
  type PlanArea,
  type PlanRect,
  type PlanStair,
} from './plan.ts';

/** Contact, not overlap: solids that only touch neither hide nor order each other. */
export const EPS = 1e-6;

/** An axis-aligned box in plan metres. A wall is a box with no thickness. */
export interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
}

/** A hole in a wall: `from`–`to` along the wall, `bottom`–`top` in height. */
export interface Opening {
  readonly from: number;
  readonly to: number;
  readonly bottom: number;
  readonly top: number;
}

export type SolidKind = 'slab' | 'wall-x0' | 'wall-y0' | 'step';

/** One piece of the house: a floor slab, a back wall with its doors, or a stair step. */
export interface Solid {
  readonly kind: SolidKind;
  /** The area or flight it belongs to. */
  readonly owner: string;
  readonly storey: Storey;
  readonly outdoor: boolean;
  readonly box: Box;
  /** Door openings; walls only. */
  readonly openings: readonly Opening[];
}

export type FaceKind =
  'floor' | 'slab-x' | 'slab-y' | 'wall-x0' | 'wall-y0' | 'door' | 'step' | 'step-x' | 'step-y';

/** One flat polygon of the blockout, in plan metres. */
export interface Face {
  readonly kind: FaceKind;
  readonly points: readonly Vec3[];
}

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

/** The treads of a flight, first step first. Expects from < to (checkPlan). */
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

const boxOf = ([x, y, w, d]: PlanRect, z0: number, z1: number): Box => ({
  x0: x,
  x1: x + w,
  y0: y,
  y1: y + d,
  z0,
  z1,
});

function areaSolids(plan: FloorPlan, a: PlanArea): Solid[] {
  const z = floorZ(a);
  const [x, y, w, d] = a.rect;
  const top = z + wallHeightOf(plan, a);
  const base = { owner: a.id, storey: a.storey, outdoor: a.outdoor };
  const openings = (side: 'x0' | 'y0'): Opening[] =>
    plan.doors
      .filter((door) => door.area === a.id && door.wall === side)
      .map((door) => {
        const start = (side === 'x0' ? y : x) + door.at;
        return { from: start, to: start + door.width, bottom: z, top: z + door.height };
      });
  const solids: Solid[] = [
    { ...base, kind: 'slab', box: boxOf(a.rect, z - plan.slab, z), openings: [] },
  ];
  if (a.walls.includes('x0')) {
    const box = { x0: x, x1: x, y0: y, y1: y + d, z0: z, z1: top };
    solids.push({ ...base, kind: 'wall-x0', box, openings: openings('x0') });
  }
  if (a.walls.includes('y0')) {
    const box = { x0: x, x1: x + w, y0: y, y1: y, z0: z, z1: top };
    solids.push({ ...base, kind: 'wall-y0', box, openings: openings('y0') });
  }
  return solids;
}

/** Every solid of the house. Throws on a door whose area is missing: run checkPlan first. */
export function buildSolids(plan: FloorPlan): Solid[] {
  const areas = new Set(plan.areas.map((a) => a.id));
  plan.doors.forEach((door, i) => {
    if (!areas.has(door.area)) {
      throw new Error(`doors[${i}]: unknown area ${door.area}; run checkPlan first`);
    }
  });
  const steps = plan.stairs.flatMap((s) =>
    stepsOf(s).map((step): Solid => ({
      kind: 'step',
      owner: s.id,
      storey: s.storey,
      outdoor: false,
      box: boxOf(step.rect, Math.min(s.from, s.to), step.top),
      openings: [],
    })),
  );
  return [...plan.areas.flatMap((a) => areaSolids(plan, a)), ...steps];
}

/** The faces the camera can see, in the order to draw them: the box's own faces never overlap. */
export function facesOf(s: Solid): Face[] {
  const { x0, x1, y0, y1, z0, z1 } = s.box;
  const top: PlanRect = [x0, y0, x1 - x0, y1 - y0];
  switch (s.kind) {
    case 'slab':
      return [
        { kind: 'floor', points: quadZ(z1, top) },
        { kind: 'slab-x', points: quadX(x1, y0, y1, z0, z1) },
        { kind: 'slab-y', points: quadY(y1, x0, x1, z0, z1) },
      ];
    case 'step':
      return [
        { kind: 'step', points: quadZ(z1, top) },
        { kind: 'step-x', points: quadX(x1, y0, y1, z0, z1) },
        { kind: 'step-y', points: quadY(y1, x0, x1, z0, z1) },
      ];
    case 'wall-x0':
      return [
        { kind: 'wall-x0', points: quadX(x0, y0, y1, z0, z1) },
        ...s.openings.map((o): Face => ({
          kind: 'door',
          points: quadX(x0, o.from, o.to, o.bottom, o.top),
        })),
      ];
    case 'wall-y0':
      return [
        { kind: 'wall-y0', points: quadY(y0, x0, x1, z0, z1) },
        ...s.openings.map((o): Face => ({
          kind: 'door',
          points: quadY(y0, o.from, o.to, o.bottom, o.top),
        })),
      ];
  }
}

type Range = readonly [number, number];

const overlaps = ([a0, a1]: Range, [b0, b1]: Range): boolean =>
  Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/**
 * A box projects to a hexagon whose edges run along the projected x, y and z axes, so two
 * hexagons overlap exactly when their ranges of x − y, x − z and y − z all overlap.
 */
function screenOverlap(a: Box, b: Box): boolean {
  const ranges = (k: Box): [Range, Range, Range] => [
    [k.x0 - k.y1, k.x1 - k.y0],
    [k.x0 - k.z1, k.x1 - k.z0],
    [k.y0 - k.z1, k.y1 - k.z0],
  ];
  const ra = ranges(a);
  const rb = ranges(b);
  return ra.every((r, i) => {
    const other = rb[i];
    return other !== undefined && overlaps(r, other);
  });
}

/**
 * -1 when `a` must be drawn before `b`, 1 after, 0 when the order doesn't matter. The camera sits
 * toward +x +y +z, so of two boxes split by a plane, the one on the low side is behind.
 */
function behind(a: Box, b: Box): -1 | 0 | 1 {
  if (!screenOverlap(a, b)) return 0;
  const axes: [number, number, number, number][] = [
    [a.x0, a.x1, b.x0, b.x1],
    [a.y0, a.y1, b.y0, b.y1],
    [a.z0, a.z1, b.z0, b.z1],
  ];
  for (const [a0, a1, b0, b1] of axes) {
    if (a1 <= b0 + EPS) return -1;
    if (b1 <= a0 + EPS) return 1;
  }
  return 0;
}

const centreDepth = (k: Box): number =>
  depthKey({ x: (k.x0 + k.x1) / 2, y: (k.y0 + k.y1) / 2, z: (k.z0 + k.z1) / 2 });

/**
 * Painter's order for the whole house, across storeys: a topological sort of the "is behind"
 * relation between solids that overlap on screen, ties broken back to front. Interpenetrating
 * boxes have no such relation and fall back to the depth key.
 */
export function drawOrder(solids: readonly Solid[]): Solid[] {
  const n = solids.length;
  const after: number[][] = solids.map(() => []);
  const blockers = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = solids[i];
      const b = solids[j];
      if (!a || !b) continue;
      const order = behind(a.box, b.box);
      if (order === 0) continue;
      const [first, second] = order < 0 ? [i, j] : [j, i];
      after[first]?.push(second);
      blockers[second] = (blockers[second] ?? 0) + 1;
    }
  }
  const depth = solids.map((s) => centreDepth(s.box));
  const done = new Set<number>();
  const out: Solid[] = [];
  while (out.length < n) {
    const open = [...Array(n).keys()].filter((i) => !done.has(i));
    const ready = open.filter((i) => blockers[i] === 0);
    // A cycle can only come from interpenetrating boxes; draw the farthest of them first.
    const pool = ready.length > 0 ? ready : open;
    const next = pool.reduce((best, i) => ((depth[i] ?? 0) < (depth[best] ?? 0) ? i : best));
    done.add(next);
    const solid = solids[next];
    if (solid) out.push(solid);
    for (const k of after[next] ?? []) blockers[k] = (blockers[k] ?? 0) - 1;
  }
  return out;
}
