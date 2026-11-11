import {
  CONTRACT_VERSION,
  warning,
  type Issue,
  type Point,
  type Rect,
} from '../../contracts/common.ts';
import { HOUSE_SIZE, type HouseLayout, type HouseRoom } from '../../contracts/houseLayout.ts';
import { convexHull, project, type Fit, type Vec3 } from './iso.ts';
import {
  ffl,
  floorZ,
  walkOf,
  wallHeightOf,
  type FloorPlan,
  type PlanArea,
  type PlanPoint,
  type PlanSpot,
} from './plan.ts';
import { quadX, quadY, quadZ, type Occluder } from './scene.ts';
import { hiddenBy, hiddenFloor } from './visibility.ts';

/** The blockout canvas: the 1920 × 1200 layout space at 2× (ASSETS.md §4.1). */
export const CANVAS: readonly [number, number] = [HOUSE_SIZE[0] * 2, HOUSE_SIZE[1] * 2];

/** The focus rect keeps this share of the room's size as a border, then grows to 16:10. */
const FOCUS_PAD = 0.1;
const FRAME_ASPECT = HOUSE_SIZE[0] / HOUSE_SIZE[1];

/** Layout coordinates are whole pixels, like hand-placed JSON. */
const toLayout = (p: Vec3, fit: Fit): Point => {
  const [x, y] = project(p, fit);
  return [Math.round(x / 2), Math.round(y / 2)];
};

const at = (p: PlanPoint, z: number): Vec3 => ({ x: p[0], y: p[1], z });

function bounds(points: readonly Point[]): Rect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(1, Math.max(...xs) - x), Math.max(1, Math.max(...ys) - y)];
}

/** The room's bounds padded and grown to the frame's aspect, kept on the frame. */
export function focusRect(polygon: readonly Point[]): Rect {
  const [bx, by, bw, bh] = bounds(polygon);
  const pad = FOCUS_PAD * Math.max(bw, bh);
  let w = bw + 2 * pad;
  let h = bh + 2 * pad;
  if (w / h < FRAME_ASPECT) w = h * FRAME_ASPECT;
  else h = w / FRAME_ASPECT;
  if (w > HOUSE_SIZE[0] || h > HOUSE_SIZE[1]) return [0, 0, HOUSE_SIZE[0], HOUSE_SIZE[1]];
  const clamp = (v: number, size: number, max: number): number =>
    Math.min(Math.max(v, 0), max - size);
  const x = clamp(bx + bw / 2 - w / 2, w, HOUSE_SIZE[0]);
  const y = clamp(by + bh / 2 - h / 2, h, HOUSE_SIZE[1]);
  return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
}

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

/** Share of a wall-parallel quad (bottom edge first) hidden, sampled on a grid of cell centres. */
function hiddenFace(
  face: readonly Vec3[],
  occluders: readonly Occluder[],
  cells = 6,
): { fraction: number; by: string[] } {
  const [p0, p1, , p3] = face;
  if (!p0 || !p1 || !p3) throw new Error('a spot face needs four corners');
  const by = new Set<string>();
  let hidden = 0;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const u = (i + 0.5) / cells;
      const v = (j + 0.5) / cells;
      const p = {
        x: p0.x + u * (p1.x - p0.x) + v * (p3.x - p0.x),
        y: p0.y + u * (p1.y - p0.y) + v * (p3.y - p0.y),
        z: p0.z + u * (p1.z - p0.z) + v * (p3.z - p0.z),
      };
      const o = hiddenBy(p, occluders);
      if (o) {
        hidden++;
        by.add(o.owner);
      }
    }
  }
  return { fraction: hidden / cells ** 2, by: [...by].sort((x, y) => x.localeCompare(y)) };
}

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

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
export function draftLayout(
  plan: FloorPlan,
  fit: Fit,
  occluders: readonly Occluder[],
): DraftLayout {
  const areas = new Map(plan.areas.map((a) => [a.id, a]));
  const issues: Issue[] = [];
  const hidden: HiddenFloor[] = [];
  const stands: Vec3[] = [];
  const rooms = plan.rooms.map((room, i): HouseRoom => {
    const a = areas.get(room.area);
    if (!a) throw new Error(`rooms[${i}]: unknown area ${room.area}; run checkPlan first`);
    const z = floorZ(a);
    const walk = walkOf(plan, room, a);
    stands.push(at(room.stand, z));
    const covered = hiddenFloor(walk, z, occluders);
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
      const o = hiddenBy(at(p, z), occluders);
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
    const covered = hiddenFace(face, occluders);
    if (covered.fraction > 0) {
      issues.push(
        warning(
          `spots.${name}`,
          `${percent(covered.fraction)} hidden behind ${covered.by.join(', ')}`,
        ),
      );
    }
    return { room: s.room, rect: bounds(face.map((p) => toLayout(p, fit))) };
  };

  const layout: HouseLayout = {
    version: CONTRACT_VERSION,
    size: [HOUSE_SIZE[0], HOUSE_SIZE[1]],
    rooms,
    spots: { fridge: spot('fridge'), 'sticker-wall': spot('sticker-wall') },
    occluders: [],
    waypoints: plan.waypoints.map((w) => ({
      id: w.id,
      pos: toLayout(at(w.at, w.z ?? ffl(w.storey)), fit),
      storey: w.storey,
      ...(w.stair === undefined ? {} : { stair: w.stair }),
    })),
    edges: plan.edges,
    start: plan.start,
  };
  return { layout, issues, hidden, stands };
}
