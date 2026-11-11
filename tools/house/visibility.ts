import type { Vec3 } from './iso.ts';
import type { PlanRect } from './plan.ts';
import type { Occluder } from './scene.ts';

/** Ignores contact: a point on a face's edge, or a solid touching the point, does not hide it. */
const EPS = 1e-3;

const strictlyInside = (v: number, lo: number, hi: number): boolean => v > lo + EPS && v < hi - EPS;

/**
 * In the 2:1 projection a point (x, y, z) lands on the same pixel as (x + d, y + d, z + d), so the
 * ray to the camera runs along (1, 1, 1). A solid hides the point when that ray passes through it.
 */
function hides(o: Occluder, p: Vec3): boolean {
  if (o.kind === 'slab') {
    const [x, y, w, d] = o.rect;
    // Checking the top and bottom faces covers a slab as thin as a floor.
    return [o.top, o.bottom].some((face) => {
      const t = face - p.z;
      return t > EPS && strictlyInside(p.x + t, x, x + w) && strictlyInside(p.y + t, y, y + d);
    });
  }
  const t = o.at - (o.side === 'x0' ? p.x : p.y);
  const along = (o.side === 'x0' ? p.y : p.x) + t;
  return t > EPS && strictlyInside(along, o.from, o.to) && strictlyInside(p.z + t, o.bottom, o.top);
}

/** The first solid hiding `p`, if any. */
export const hiddenBy = (p: Vec3, occluders: readonly Occluder[]): Occluder | undefined =>
  occluders.find((o) => hides(o, p));

export interface HiddenSamples {
  /** Share of the sampled floor that is hidden, 0–1. */
  readonly fraction: number;
  readonly points: readonly Vec3[];
  /** Owners of the solids that hide something, sorted. */
  readonly by: readonly string[];
}

/** Samples a floor rect at height z on a grid of `step` metres (cell centres). */
export function hiddenFloor(
  rect: PlanRect,
  z: number,
  occluders: readonly Occluder[],
  step = 0.1,
): HiddenSamples {
  const [x, y, w, d] = rect;
  const nx = Math.max(1, Math.round(w / step));
  const ny = Math.max(1, Math.round(d / step));
  const points: Vec3[] = [];
  const by = new Set<string>();
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const p = { x: x + ((i + 0.5) * w) / nx, y: y + ((j + 0.5) * d) / ny, z };
      const o = hiddenBy(p, occluders);
      if (o) {
        points.push(p);
        by.add(o.owner);
      }
    }
  }
  return { fraction: points.length / (nx * ny), points, by: [...by].sort() };
}
