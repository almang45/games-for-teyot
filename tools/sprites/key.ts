import { OPAQUE } from '../validate/sprites.ts';
import type { Raster } from './raster.ts';

type Rgb = readonly [number, number, number];

/** Corner pixels this transparent mean the strip already has no background. */
const CLEAR = 16;
/** RGB distance a flat background may wander: generated "flat" colour is never exact. */
const MAX_SPREAD = 24;
/** Below this distance from the key a pixel is background (raised for a noisier background). */
const KEY_FLOOR = 36;
/** Edge pixels with no solid neighbour to compare with ramp to opaque over this distance. */
const KEY_RAMP = 128;
/** How far off the key-to-figure line an edge colour may sit and still count as a mix of the two. */
const MIX_TOLERANCE = 24;
/** How far an edge pixel looks for a solid figure pixel to unmix against. */
const REACH = 2;

export interface Keyed {
  readonly raster: Raster;
  /** The background colour removed, or undefined when the strip was already transparent. */
  readonly key?: Rgb;
}

/** Undoes c = a·f + (1 − a)·k for one channel; a Uint8Array would wrap, so clamp. */
const unmix = (c: number, k: number, a: number): number =>
  Math.min(255, Math.max(0, Math.round((c - (1 - a) * k) / a)));

const distance = (r: number, g: number, b: number, k: Rgb): number =>
  Math.hypot(r - k[0], g - k[1], b - k[2]);

function cornerPixels(r: Raster): number[][] {
  const size = Math.max(4, Math.round(Math.min(r.width, r.height) * 0.02));
  const corners: number[][] = [];
  for (const [cx, cy] of [
    [0, 0],
    [r.width - size, 0],
    [0, r.height - size],
    [r.width - size, r.height - size],
  ] as const) {
    const pixels: number[] = [];
    for (let y = Math.max(0, cy); y < Math.min(r.height, cy + size); y++) {
      for (let x = Math.max(0, cx); x < Math.min(r.width, cx + size); x++)
        pixels.push(y * r.width + x);
    }
    corners.push(pixels);
  }
  return corners;
}

function meanRgb(r: Raster, pixels: readonly number[]): Rgb {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const i of pixels) {
    sr += r.rgba[i * 4] ?? 0;
    sg += r.rgba[i * 4 + 1] ?? 0;
    sb += r.rgba[i * 4 + 2] ?? 0;
  }
  const n = Math.max(1, pixels.length);
  return [sr / n, sg / n, sb / n];
}

/**
 * Removes a flat background sampled from the four corners. Pixels inside the figure stay fully
 * opaque, even a pinhole whose colour is near the key (see figureMask); only the one-pixel edge
 * gets a soft alpha, with the key unmixed out of it so no coloured fringe remains. A strip that
 * is already transparent passes through untouched.
 */
export function removeBackground(r: Raster): Keyed {
  const corners = cornerPixels(r);
  const all = corners.flat();
  const clear = all.filter((i) => (r.rgba[i * 4 + 3] ?? 0) < CLEAR).length;
  if (clear >= all.length * 0.9) return { raster: { ...r, rgba: Uint8Array.from(r.rgba) } };

  const key = meanRgb(r, all);
  const spread = Math.sqrt(
    all.reduce((sum, i) => {
      const d = distance(r.rgba[i * 4] ?? 0, r.rgba[i * 4 + 1] ?? 0, r.rgba[i * 4 + 2] ?? 0, key);
      return sum + d * d;
    }, 0) / all.length,
  );
  const cornerDrift = Math.max(...corners.map((c) => distance(...meanRgb(r, c), key)));
  if (spread > MAX_SPREAD || cornerDrift > MAX_SPREAD) {
    throw new Error(
      `the background is not one flat colour (spread ${spread.toFixed(0)}, corners ${cornerDrift.toFixed(0)} apart): generate on a single flat colour, or export with transparency`,
    );
  }

  const floor = Math.max(KEY_FLOOR, spread * 3);
  const { width, height } = r;
  const src = r.rgba;
  const far = new Float64Array(width * height);
  const near = new Uint8Array(width * height);
  for (let i = 0; i < far.length; i++) {
    far[i] = distance(src[i * 4] ?? 0, src[i * 4 + 1] ?? 0, src[i * 4 + 2] ?? 0, key);
    near[i] = (far[i] ?? 0) <= floor || (src[i * 4 + 3] ?? 0) === 0 ? 1 : 0;
  }
  const figure = figureMask(near, width, height);
  const solid = erode(figure, width, height);
  const out = new Uint8Array(src.length);
  for (let i = 0; i < far.length; i++) {
    const o = i * 4;
    const x = i % width;
    const y = (i - x) / width;
    if (solid[i] === 1) {
      out.set(src.subarray(o, o + 4), o);
      continue;
    }
    if (!touches(figure, width, height, x, y)) continue;
    const c: Rgb = [src[o] ?? 0, src[o + 1] ?? 0, src[o + 2] ?? 0];
    const f = nearestSolid(solid, width, height, x, y);
    const pure: Rgb | undefined =
      f === undefined ? undefined : [src[f * 4] ?? 0, src[f * 4 + 1] ?? 0, src[f * 4 + 2] ?? 0];
    let a = edgeAlpha(c, key, pure, MIX_TOLERANCE + spread) ?? ((far[i] ?? 0) - floor) / KEY_RAMP;
    a = Math.min(1, Math.max(0, a)) * ((src[o + 3] ?? 0) / 255);
    if (a <= 0) continue;
    out[o] = unmix(c[0], key[0], a);
    out[o + 1] = unmix(c[1], key[1], a);
    out[o + 2] = unmix(c[2], key[2], a);
    out[o + 3] = Math.round(a * 255);
  }
  return { raster: { width, height, rgba: out }, key };
}

/** Enclosed key-coloured areas smaller than this share of the strip are figure detail. */
const PINHOLE_SHARE = 0.0002;
const MIN_PINHOLE = 64;

/**
 * What is figure, by connectivity rather than colour alone. Key-coloured pixels joined to the
 * border are background. An enclosed key-coloured area is a gap in the pose (between an arm and
 * the body) when it is large, and figure detail when it is a pinhole: punching that out would
 * leave a see-through hole in the body.
 */
function figureMask(near: Uint8Array, width: number, height: number): Uint8Array {
  // 4-connected, so background never leaks through a diagonal gap in an outline.
  const { labels, sizes, edge } = label(near, width, height, false);
  const pinhole = Math.max(MIN_PINHOLE, width * height * PINHOLE_SHARE);
  const figure = new Uint8Array(near.length);
  for (let i = 0; i < near.length; i++) {
    const group = labels[i] ?? 0;
    const background = near[i] === 1 && (edge[group] === true || (sizes[group] ?? 0) >= pinhole);
    figure[i] = background ? 0 : 1;
  }
  return figure;
}

/**
 * An edge pixel is figure colour f over the key: c = a·f + (1 − a)·k. When c lies on the line
 * from k to the nearest solid colour, a is how far along it c sits. Otherwise c is a colour of
 * its own (a thin outline next to skin), and the caller falls back to the distance ramp.
 */
function edgeAlpha(c: Rgb, k: Rgb, f: Rgb | undefined, tolerance: number): number | undefined {
  if (!f) return undefined;
  const fk = [f[0] - k[0], f[1] - k[1], f[2] - k[2]] as const;
  const ck = [c[0] - k[0], c[1] - k[1], c[2] - k[2]] as const;
  const length = fk[0] ** 2 + fk[1] ** 2 + fk[2] ** 2;
  if (length === 0) return undefined;
  const t = (ck[0] * fk[0] + ck[1] * fk[1] + ck[2] * fk[2]) / length;
  const off = Math.hypot(ck[0] - t * fk[0], ck[1] - t * fk[1], ck[2] - t * fk[2]);
  return off <= tolerance ? t : undefined;
}

/** Figure pixels whose eight neighbours are all figure: safely inside, never mixed with the key. */
function erode(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1 && all; dx++) all = mask[(y + dy) * width + x + dx] === 1;
      }
      if (all) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Whether (x, y) or a neighbour is figure. */
function touches(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
      if (mask[ny * width + nx] === 1) return true;
    }
  }
  return false;
}

/** Index of the closest solid pixel within REACH, or undefined. */
function nearestSolid(
  solid: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number | undefined {
  let best: number | undefined;
  let bestDistance = Infinity;
  for (let ny = Math.max(0, y - REACH); ny <= Math.min(height - 1, y + REACH); ny++) {
    for (let nx = Math.max(0, x - REACH); nx <= Math.min(width - 1, x + REACH); nx++) {
      const d = (nx - x) ** 2 + (ny - y) ** 2;
      if (solid[ny * width + nx] === 1 && d < bestDistance) {
        best = ny * width + nx;
        bestDistance = d;
      }
    }
  }
  return best;
}

interface Labelled {
  /** A group number per pixel, 0 outside the mask. */
  readonly labels: Int32Array;
  /** Pixels per group, indexed by group number. */
  readonly sizes: number[];
  /** Whether each group touches the image border. */
  readonly edge: boolean[];
}

/** Connected groups of mask pixels, 8-connected or, with `diagonal` off, 4-connected. */
function label(mask: Uint8Array, width: number, height: number, diagonal: boolean): Labelled {
  const labels = new Int32Array(mask.length);
  const sizes = [0];
  const edge = [false];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (labels[start] !== 0 || mask[start] === 0) continue;
    const group = sizes.length;
    let size = 0;
    let touches = false;
    labels[start] = group;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      size++;
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touches = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!diagonal && dx !== 0 && dy !== 0) continue;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (labels[n] !== 0 || mask[n] === 0) continue;
          labels[n] = group;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
    edge.push(touches);
  }
  return { labels, sizes, edge };
}

/** 8-connected groups of opaque pixels. */
function components(r: Raster): Labelled {
  const mask = new Uint8Array(r.width * r.height);
  for (let i = 0; i < mask.length; i++) mask[i] = (r.rgba[i * 4 + 3] ?? 0) >= OPAQUE ? 1 : 0;
  return label(mask, r.width, r.height, true);
}

/** Grows a mask by `radius` pixels in every direction (a square neighbourhood). */
function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const across = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      for (let nx = Math.max(0, x - radius); nx <= Math.min(width - 1, x + radius); nx++) {
        across[y * width + nx] = 1;
      }
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (across[y * width + x] === 0) continue;
      for (let ny = Math.max(0, y - radius); ny <= Math.min(height - 1, y + radius); ny++) {
        out[ny * width + x] = 1;
      }
    }
  }
  return out;
}

/** A speck smaller than this share of the largest figure is noise, not art. */
const SPECK_SHARE = 0.01;
const MIN_SPECK = 16;
/** Soft pixels further than this from a kept figure are leftover background noise. */
const HALO = 2;

/**
 * Clears what keying leaves behind: opaque specks far smaller than the figures, and faint
 * pixels nowhere near one. Returns the cleaned raster and how many specks went.
 */
export function dropSpecks(r: Raster): { raster: Raster; specks: number } {
  const { labels, sizes } = components(r);
  const largest = Math.max(0, ...sizes);
  const min = Math.max(MIN_SPECK, largest * SPECK_SHARE);
  const kept = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    if ((sizes[labels[i] ?? 0] ?? 0) >= min && labels[i] !== 0) kept[i] = 1;
  }
  const near = dilate(kept, r.width, r.height, HALO);
  const out = Uint8Array.from(r.rgba);
  for (let i = 0; i < labels.length; i++) {
    if (kept[i] === 1) continue;
    const a = out[i * 4 + 3] ?? 0;
    if (a >= OPAQUE || near[i] === 0) out[i * 4 + 3] = 0;
  }
  const specks = sizes.filter((s, label) => label > 0 && s < min).length;
  return { raster: { width: r.width, height: r.height, rgba: out }, specks };
}
