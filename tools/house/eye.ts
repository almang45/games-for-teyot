import type { Point } from '../../contracts/common.ts';
import { floorZ, type FloorPlan, type PlanView } from './plan.ts';
import { encodePng } from './png.ts';
import { EPS, isWall, type Box, type FaceKind, type Opening, type Solid } from './scene.ts';
import { FILL, GRID_STROKE, label, STROKE } from './svg.ts';

/*
 * Review renders from a person's eye (US-REF-02): a perspective ray cast of the blockout, so Papa
 * can hold the plan up against the real room from the same spot. The game keeps its one dollhouse
 * angle; nothing here reaches the layout.
 */

export type V3 = readonly [number, number, number];
type Axis = 0 | 1 | 2;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => mul(a, 1 / Math.hypot(...a));

const lo = (b: Box, a: Axis): number => (a === 0 ? b.x0 : a === 1 ? b.y0 : b.z0);
const hi = (b: Box, a: Axis): number => (a === 0 ? b.x1 : a === 1 ? b.y1 : b.z1);

/** Where a ray enters one axis' slab; NaN when it runs alongside and outside it. */
function near(l: number, h: number, o: number, d: number): number {
  if (Math.abs(d) < 1e-12) return o >= l - EPS && o <= h + EPS ? -Infinity : NaN;
  return Math.min((l - o) / d, (h - o) / d);
}

function far(l: number, h: number, o: number, d: number): number {
  if (Math.abs(d) < 1e-12) return o >= l - EPS && o <= h + EPS ? Infinity : NaN;
  return Math.max((l - o) / d, (h - o) / d);
}

const nears = (b: Box, o: V3, d: V3): V3 => [
  near(b.x0, b.x1, o[0], d[0]),
  near(b.y0, b.y1, o[1], d[1]),
  near(b.z0, b.z1, o[2], d[2]),
];

/** Distance to where the ray enters the box, or Infinity. A box around the origin isn't seen. */
function enterAt(b: Box, o: V3, d: V3): number {
  // Spelled out rather than through nears(): this runs for every solid behind every pixel.
  const t0 = Math.max(
    near(b.x0, b.x1, o[0], d[0]),
    near(b.y0, b.y1, o[1], d[1]),
    near(b.z0, b.z1, o[2], d[2]),
  );
  const t1 = Math.min(
    far(b.x0, b.x1, o[0], d[0]),
    far(b.y0, b.y1, o[1], d[1]),
    far(b.z0, b.z1, o[2], d[2]),
  );
  // NaN from a parallel miss fails both comparisons.
  return t0 <= t1 + EPS && t0 > EPS ? t0 : Infinity;
}

export interface Hit {
  readonly solid: Solid;
  /** Distance along the ray, in metres. */
  readonly t: number;
  /** The axis of the face the ray entered through. */
  readonly axis: Axis;
  /** +1 when that face points along +axis. */
  readonly side: 1 | -1;
  readonly point: V3;
  /** The unit ray that made the hit. */
  readonly dir: V3;
}

/** The door at a point of a wall, its bounds grown by `margin`. */
function openingAt(wall: Solid, p: V3, margin: number): Opening | undefined {
  const along = wall.kind === 'wall-x0' ? p[1] : p[0];
  return wall.openings.find(
    (o) =>
      along >= o.from - margin &&
      along <= o.to + margin &&
      p[2] >= o.bottom - margin &&
      p[2] <= o.top + margin,
  );
}

/**
 * The first solid a unit ray enters, ahead of its origin. Rays pass through open doors, and
 * where faces meet in one plane the wall wins: it stands in front of what is built behind it.
 */
export function castRay(solids: readonly Solid[], o: V3, d: V3): Hit | undefined {
  let best: Solid | undefined;
  let bestT = Infinity;
  for (const s of solids) {
    const t = enterAt(s.box, o, d);
    const tie = t <= bestT + EPS && best !== undefined && isWall(s) && !isWall(best);
    if (!(t < bestT - EPS || tie)) continue;
    if (isWall(s) && openingAt(s, add(o, mul(d, t)), 0)?.open) continue;
    bestT = t;
    best = s;
  }
  if (!best) return undefined;
  // The entry face is the slab entered last; argmax rather than equality with bestT, so this
  // never depends on enterAt and nears rounding alike.
  const [nx, ny, nz] = nears(best.box, o, d);
  const axis: Axis = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
  return {
    solid: best,
    t: bestT,
    axis,
    side: d[axis] > 0 ? -1 : 1,
    point: add(o, mul(d, bestT)),
    dir: d,
  };
}

/** The blockout face colour a hit shows, matching the dollhouse SVGs. */
export function faceKindOf(h: Hit): FaceKind {
  const { solid, axis, side } = h;
  const top = axis === 2 && side > 0;
  switch (solid.kind) {
    case 'slab':
      if (top) return 'floor';
      // A slab seen from below is a ceiling, so it takes a wall's colour.
      if (axis === 2) return 'wall-y0';
      return axis === 0 ? 'slab-x' : 'slab-y';
    case 'wall-x0':
    case 'wall-y0':
      return openingAt(solid, h.point, 0) ? 'door' : solid.kind;
    case 'step':
    case 'prop':
      if (top) return solid.kind;
      return axis === 0 ? `${solid.kind}-x` : `${solid.kind}-y`;
  }
}

type Line = 'edge' | 'major' | 'minor';

const GRID_FACES: ReadonlySet<FaceKind> = new Set(['floor', 'wall-x0', 'wall-y0']);

/** How far a line may widen where the ray grazes a face, so far floors keep their grid. */
const GRAZE_CAP = 4;

/**
 * A box edge, a door jamb or a grid line within `width` metres of the hit. Where the ray grazes
 * the face a pixel covers more of it along the ray's run, so the width grows that way.
 */
export function lineAt(h: Hit, kind: FaceKind, width: number, grid: number): Line | undefined {
  const axes = ([0, 1, 2] as const).filter((a) => a !== h.axis);
  const b = h.solid.box;
  const facing = Math.max(Math.abs(h.dir[h.axis]), 1e-6);
  const across = (a: Axis): number =>
    width * Math.min(GRAZE_CAP, Math.hypot(facing, h.dir[a]) / facing);
  for (const a of axes) {
    const c = h.point[a];
    if (Math.abs(c - lo(b, a)) < across(a) || Math.abs(c - hi(b, a)) < across(a)) return 'edge';
  }
  if (isWall(h.solid)) {
    const alongAxis = h.solid.kind === 'wall-x0' ? 1 : 0;
    const door = openingAt(h.solid, h.point, Math.max(...axes.map(across)));
    if (door) {
      const along = h.point[alongAxis];
      const jamb = [door.from, door.to].some((e) => Math.abs(along - e) < across(alongAxis));
      if (jamb || Math.abs(h.point[2] - door.top) < across(2)) return 'edge';
    }
  }
  // Ceilings (a slab seen from below) carry no grid, as in the dollhouse.
  if (!GRID_FACES.has(kind) || (h.solid.kind === 'slab' && kind !== 'floor')) return undefined;
  for (const a of axes) {
    // Wall heights count up from the wall's own floor, as gridLinesOf draws them.
    const c = a === 2 ? h.point[2] - b.z0 : h.point[a];
    const half = across(a) / 2;
    if (Math.abs(c - Math.round(c / grid) * grid) < half) {
      return Math.abs(c - Math.round(c)) < half ? 'major' : 'minor';
    }
  }
  return undefined;
}

export interface Camera {
  readonly eye: V3;
  readonly forward: V3;
  readonly right: V3;
  readonly up: V3;
  /** tan of half the field of view, across and down. */
  readonly tanX: number;
  readonly tanY: number;
  readonly width: number;
  readonly height: number;
}

/** Throws on a view whose area is missing: run checkPlan first. */
export function cameraOf(plan: FloorPlan, view: PlanView): Camera {
  const a = plan.areas.find((area) => area.id === view.area);
  if (!a) throw new Error(`view ${view.id}: unknown area ${view.area}; run checkPlan first`);
  const z = floorZ(a);
  const eye: V3 = [view.eye[0], view.eye[1], z + view.eye[2]];
  const forward = unit(sub([view.look[0], view.look[1], z + view.look[2]], eye));
  // The plan is left-handed with z up (the dollhouse draws +x to the right of +y), so right is
  // up × forward, not forward × up; the other way round mirrors the room.
  const right = unit(cross([0, 0, 1], forward));
  const [width, height] = view.size;
  const tanX = Math.tan((view.fov * Math.PI) / 360);
  return {
    eye,
    forward,
    right,
    up: cross(forward, right),
    tanX,
    tanY: (tanX * height) / width,
    width,
    height,
  };
}

/** The unit ray through the centre of pixel (px, py). */
export function rayAt(cam: Camera, px: number, py: number): V3 {
  const sx = ((2 * (px + 0.5)) / cam.width - 1) * cam.tanX;
  const sy = (1 - (2 * (py + 0.5)) / cam.height) * cam.tanY;
  return unit(add(cam.forward, add(mul(cam.right, sx), mul(cam.up, sy))));
}

/** Image px of a plan point, or undefined when it is behind the eye. */
export function projectTo(cam: Camera, p: V3): Point | undefined {
  const v = sub(p, cam.eye);
  const depth = dot(v, cam.forward);
  if (depth <= EPS) return undefined;
  const sx = dot(v, cam.right) / depth / cam.tanX;
  const sy = dot(v, cam.up) / depth / cam.tanY;
  return [((sx + 1) / 2) * cam.width, ((1 - sy) / 2) * cam.height];
}

const rgbOf = (hex: string): V3 => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const mix = (a: V3, b: V3, k: number): V3 => add(mul(a, 1 - k), mul(b, k));

// Each colour is parsed once: shade runs for every pixel.
const parsed = new Map<string, V3>();
function fillOf(kind: FaceKind, outdoor: boolean): V3 {
  const hex = FILL[kind][outdoor ? 1 : 0];
  let rgb = parsed.get(hex);
  if (!rgb) {
    rgb = rgbOf(hex);
    parsed.set(hex, rgb);
  }
  return rgb;
}

const BACKGROUND: V3 = [255, 255, 255];
const EDGE_RGB = rgbOf(STROKE);
const GRID_RGB = rgbOf(GRID_STROKE);

/** The colour of one pixel: face fill, then any edge or grid line over it. */
export function shade(
  solids: readonly Solid[],
  cam: Camera,
  grid: number,
  px: number,
  py: number,
): V3 {
  const h = castRay(solids, cam.eye, rayAt(cam, px, py));
  if (!h) return BACKGROUND;
  const kind = faceKindOf(h);
  const base = fillOf(kind, h.solid.outdoor);
  // One pixel's width at the hit, so lines stay about a pixel wide near and far.
  const pixel = (h.t * 2 * cam.tanX) / cam.width;
  const line = lineAt(h, kind, pixel * 0.9, grid);
  if (line === 'edge') return EDGE_RGB;
  if (line === 'major') return mix(base, GRID_RGB, 0.6);
  if (line === 'minor') return mix(base, GRID_RGB, 0.3);
  return base;
}

export function renderEye(solids: readonly Solid[], cam: Camera, grid: number): Uint8Array {
  const rgb = new Uint8Array(cam.width * cam.height * 3);
  for (let py = 0; py < cam.height; py++) {
    for (let px = 0; px < cam.width; px++) {
      rgb.set(shade(solids, cam, grid, px, py).map(Math.round), (py * cam.width + px) * 3);
    }
  }
  return rgb;
}

export interface EyeLabel {
  readonly text: string;
  readonly at: Point;
}

/** A label on each piece of furniture the eye can see: its top, or a side facing the eye. */
export function eyeLabels(solids: readonly Solid[], cam: Camera): EyeLabel[] {
  const [ex, ey] = cam.eye;
  const labels: EyeLabel[] = [];
  for (const s of solids.filter((p) => p.kind === 'prop')) {
    const { x0, x1, y0, y1, z0, z1 } = s.box;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    const sideX = ex >= x1 ? x1 : ex <= x0 ? x0 : undefined;
    const sideY = ey >= y1 ? y1 : ey <= y0 ? y0 : undefined;
    const candidates: V3[] = [
      [cx, cy, z1],
      ...(sideX === undefined ? [] : [[sideX, cy, cz] as const]),
      ...(sideY === undefined ? [] : [[cx, sideY, cz] as const]),
    ];
    const at = candidates
      .filter((p) => castRay(solids, cam.eye, unit(sub(p, cam.eye)))?.solid === s)
      .map((p) => projectTo(cam, p))
      .find(
        (q) => q !== undefined && q[0] >= 0 && q[0] <= cam.width && q[1] >= 0 && q[1] <= cam.height,
      );
    if (at) labels.push({ text: s.owner.slice(s.owner.indexOf('.') + 1), at });
  }
  return labels;
}

/** `house-eye-<id>.svg`: the render as an embedded PNG, labelled in SVG text. */
export const eyeFile = (id: string): string => `house-eye-${id}.svg`;

export function eyeSvg(solids: readonly Solid[], plan: FloorPlan, view: PlanView): string {
  const cam = cameraOf(plan, view);
  const png = encodePng(cam.width, cam.height, renderEye(solids, cam, plan.grid));
  const size = Math.max(12, Math.round(cam.width / 70));
  const { width: w, height: h } = cam;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<image width="${w}" height="${h}" href="data:image/png;base64,${png.toString('base64')}"/>`,
    `<g id="eye-labels" font-family="sans-serif" fill="#1b1b1b">`,
    ...eyeLabels(solids, cam).map((l) => {
      // Keep the text inside the image; sans-serif runs about 0.55 em a character. Text wider
      // than the image is centred on it. Below the baseline leave room for descenders.
      const half = Math.min((l.text.length * size * 0.55) / 2, w / 2);
      const x = Math.min(Math.max(l.at[0], half), w - half);
      const y = Math.min(Math.max(l.at[1], size), h - size * 0.3);
      return `  ${label(l.text, [x, y], size)}`;
    }),
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
