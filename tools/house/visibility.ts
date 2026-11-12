import type { Vec3 } from './iso.ts';
import { EPS, isWall, type Solid } from './scene.ts';

/** Ignores contact: a solid touching the point, or grazed along an edge, does not hide it. */
const GRAZE = 1e-3;

const inside = (v: number, lo: number, hi: number): boolean => v > lo + GRAZE && v < hi - GRAZE;

/**
 * In the 2:1 projection a point (x, y, z) lands on the same pixel as (x + t, y + t, z + t), so the
 * ray to the camera runs along (1, 1, 1). A box hides the point when the ray runs through it for
 * more than a graze; a wall, which has no thickness, when the ray crosses it outside its doors.
 */
function hides(s: Solid, p: Vec3): boolean {
  const { box } = s;
  if (isWall(s)) {
    const t = s.kind === 'wall-x0' ? box.x0 - p.x : box.y0 - p.y;
    if (t <= GRAZE) return false;
    const along = (s.kind === 'wall-x0' ? p.y : p.x) + t;
    const [lo, hi] = s.kind === 'wall-x0' ? [box.y0, box.y1] : [box.x0, box.x1];
    const z = p.z + t;
    if (!inside(along, lo, hi) || !inside(z, box.z0, box.z1)) return false;
    return !s.openings.some((o) => inside(along, o.from, o.to) && inside(z, o.bottom, o.top));
  }
  const enter = Math.max(box.x0 - p.x, box.y0 - p.y, box.z0 - p.z, EPS);
  const leave = Math.min(box.x1 - p.x, box.y1 - p.y, box.z1 - p.z);
  return leave - enter > GRAZE;
}

/** The first solid hiding `p`, if any. */
export const hiddenBy = (p: Vec3, solids: readonly Solid[]): Solid | undefined =>
  solids.find((s) => hides(s, p));

export interface HiddenSamples {
  /** Share of the samples that are hidden, 0–1. */
  readonly fraction: number;
  readonly points: readonly Vec3[];
  /** Owners of the solids that hide something, sorted. */
  readonly by: readonly string[];
}

/**
 * Samples a flat quad (a corner, then its two neighbours along the edges) at cell centres about
 * `step` metres apart. Serves floors and spots on a wall alike.
 */
export function hiddenQuad(
  quad: readonly Vec3[],
  solids: readonly Solid[],
  step = 0.1,
): HiddenSamples {
  const [p0, p1, , p3] = quad;
  if (!p0 || !p1 || !p3) throw new Error('a quad needs four corners');
  const length = (a: Vec3, b: Vec3): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const nu = Math.max(1, Math.round(length(p0, p1) / step));
  const nv = Math.max(1, Math.round(length(p0, p3) / step));
  const points: Vec3[] = [];
  const by = new Set<string>();
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = (i + 0.5) / nu;
      const v = (j + 0.5) / nv;
      const p = {
        x: p0.x + u * (p1.x - p0.x) + v * (p3.x - p0.x),
        y: p0.y + u * (p1.y - p0.y) + v * (p3.y - p0.y),
        z: p0.z + u * (p1.z - p0.z) + v * (p3.z - p0.z),
      };
      const s = hiddenBy(p, solids);
      if (s) {
        points.push(p);
        by.add(s.owner);
      }
    }
  }
  return {
    fraction: points.length / (nu * nv),
    points,
    by: [...by].sort((a, b) => a.localeCompare(b)),
  };
}
