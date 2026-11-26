import type { Raster } from '../../../tools/sprites/raster';

export type Rgb = readonly [number, number, number];

export const KEY_BLUE: Rgb = [20, 60, 235];
export const SKIN: Rgb = [235, 190, 160];
export const OUTLINE: Rgb = [40, 30, 30];

/** A stand-in figure: a body block with a narrower head block on top. */
export interface Pose {
  readonly height: number;
  readonly width: number;
  /** Shifts the head sideways from the body's centre, as when a pose leans or reaches. */
  readonly headShift?: number;
  /** A detached block this far right of the body (a held-out hand), as [gap, size]. */
  readonly hand?: readonly [number, number];
}

export interface StripOptions {
  /** Flat background colour; undefined leaves it transparent. */
  readonly background?: Rgb;
  /** Clear columns between poses and around the strip. */
  readonly gap?: number;
  /** Rows of background under the feet. */
  readonly floor?: number;
  /** Adds ±noise to each background channel, as generated "flat" colour has. */
  readonly noise?: number;
}

const fill = (r: Raster, x: number, y: number, [red, g, b]: Rgb, a = 255): void => {
  const o = (y * r.width + x) * 4;
  r.rgba[o] = red;
  r.rgba[o + 1] = g;
  r.rgba[o + 2] = b;
  r.rgba[o + 3] = a;
};

/** Poses left to right on one strip, every pose standing on the same floor. */
export function strip(poses: readonly Pose[], options: StripOptions = {}): Raster {
  const gap = options.gap ?? 40;
  const floor = options.floor ?? 30;
  const tallest = Math.max(...poses.map((p) => p.height));
  const width =
    gap + poses.reduce((sum, p) => sum + p.width + (p.hand ? p.hand[0] + p.hand[1] : 0) + gap, 0);
  const height = tallest + floor + gap;
  const r: Raster = { width, height, rgba: new Uint8Array(width * height * 4) };
  if (options.background) {
    let seed = 7;
    const jitter = (): number => {
      seed = (seed * 16807) % 2147483647;
      return Math.round(((seed / 2147483647) * 2 - 1) * (options.noise ?? 0));
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [red, g, b] = options.background;
        fill(r, x, y, [red + jitter(), g + jitter(), b + jitter()]);
      }
    }
  }
  let left = gap;
  const feet = height - floor - 1;
  for (const pose of poses) {
    const headHeight = Math.round(pose.height * 0.35);
    const headWidth = Math.round(pose.width * 0.6);
    const headLeft = left + Math.round((pose.width - headWidth) / 2) + (pose.headShift ?? 0);
    for (let y = feet - pose.height + 1; y <= feet; y++) {
      const inHead = y <= feet - pose.height + headHeight;
      const x0 = inHead ? headLeft : left;
      const x1 = inHead ? headLeft + headWidth - 1 : left + pose.width - 1;
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === feet || y === feet - pose.height + 1;
        fill(r, x, y, edge ? OUTLINE : SKIN);
      }
    }
    let right = left + pose.width;
    if (pose.hand) {
      const [handGap, size] = pose.hand;
      for (
        let y = feet - Math.round(pose.height / 2);
        y < feet - Math.round(pose.height / 2) + size;
        y++
      ) {
        for (let x = right + handGap; x < right + handGap + size; x++) fill(r, x, y, OUTLINE);
      }
      right += handGap + size;
    }
    left = right + gap;
  }
  return r;
}

export const pixel = (r: Raster, x: number, y: number): number[] => [
  ...r.rgba.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
];
