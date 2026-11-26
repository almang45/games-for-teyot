import { OPAQUE } from '../validate/sprites.ts';

/** RGBA8, row-major, straight (not premultiplied) alpha: the layout decodePng returns. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Inclusive pixel bounds. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export const blank = (width: number, height: number): Raster => ({
  width,
  height,
  rgba: new Uint8Array(width * height * 4),
});

export const alphaAt = (r: Raster, x: number, y: number): number =>
  r.rgba[(y * r.width + x) * 4 + 3] ?? 0;

export const boxWidth = (b: Box): number => b.right - b.left + 1;
export const boxHeight = (b: Box): number => b.bottom - b.top + 1;

/** Bounds of the pixels at least `threshold` opaque, or undefined when there are none. */
export function opaqueBox(r: Raster, threshold = OPAQUE): Box | undefined {
  let left = r.width;
  let top = r.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (alphaAt(r, x, y) < threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? undefined : { left, top, right, bottom };
}

/** A copy of `box`, clamped to the raster. */
export function crop(r: Raster, box: Box): Raster {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(r.width - 1, box.right);
  const bottom = Math.min(r.height - 1, box.bottom);
  const out = blank(Math.max(0, right - left + 1), Math.max(0, bottom - top + 1));
  for (let y = 0; y < out.height; y++) {
    const from = ((top + y) * r.width + left) * 4;
    out.rgba.set(r.rgba.subarray(from, from + out.width * 4), y * out.width * 4);
  }
  return out;
}

/** For each destination pixel, the source pixels it covers and how much of each. */
function areaWeights(from: number, to: number): { index: number; weight: number }[][] {
  const step = from / to;
  const taps: { index: number; weight: number }[][] = [];
  for (let d = 0; d < to; d++) {
    const start = d * step;
    const end = Math.min(from, start + Math.max(step, 1));
    const row: { index: number; weight: number }[] = [];
    for (let s = Math.floor(start); s < end; s++) {
      const weight = Math.min(end, s + 1) - Math.max(start, s);
      if (weight > 1e-9) row.push({ index: s, weight });
    }
    const total = row.reduce((sum, t) => sum + t.weight, 0);
    taps.push(row.map((t) => ({ index: t.index, weight: t.weight / total })));
  }
  return taps;
}

/**
 * Area-average resize in premultiplied alpha, so transparent pixels never darken an edge. It is
 * meant for downscaling generated art to frame size; upscaling would only blur.
 */
export function resize(r: Raster, width: number, height: number): Raster {
  const pre = new Float64Array(r.width * r.height * 4);
  for (let i = 0; i < r.width * r.height; i++) {
    const a = (r.rgba[i * 4 + 3] ?? 0) / 255;
    pre[i * 4] = (r.rgba[i * 4] ?? 0) * a;
    pre[i * 4 + 1] = (r.rgba[i * 4 + 1] ?? 0) * a;
    pre[i * 4 + 2] = (r.rgba[i * 4 + 2] ?? 0) * a;
    pre[i * 4 + 3] = a;
  }
  const xs = areaWeights(r.width, width);
  const ys = areaWeights(r.height, height);
  const wide = new Float64Array(width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < width; x++) {
      for (const { index, weight } of xs[x] ?? []) {
        for (let c = 0; c < 4; c++) {
          wide[(y * width + x) * 4 + c] =
            (wide[(y * width + x) * 4 + c] ?? 0) +
            (pre[(y * r.width + index) * 4 + c] ?? 0) * weight;
        }
      }
    }
  }
  const out = blank(width, height);
  const px = new Float64Array(4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      px.fill(0);
      for (const { index, weight } of ys[y] ?? []) {
        for (let c = 0; c < 4; c++)
          px[c] = (px[c] ?? 0) + (wide[(index * width + x) * 4 + c] ?? 0) * weight;
      }
      const a = px[3] ?? 0;
      const o = (y * width + x) * 4;
      if (a <= 0) continue;
      out.rgba[o] = Math.round((px[0] ?? 0) / a);
      out.rgba[o + 1] = Math.round((px[1] ?? 0) / a);
      out.rgba[o + 2] = Math.round((px[2] ?? 0) / a);
      out.rgba[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/**
 * Copies `src` into `dst` with its top-left at (x, y), replacing what is there. Returns how many
 * of src's opaque pixels fell outside dst, so a caller can refuse to clip a figure.
 */
export function blit(dst: Raster, src: Raster, x: number, y: number): number {
  let clipped = 0;
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const s = (sy * src.width + sx) * 4;
      const a = src.rgba[s + 3] ?? 0;
      if (a === 0) continue;
      const dx = x + sx;
      const dy = y + sy;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) {
        if (a >= OPAQUE) clipped++;
        continue;
      }
      dst.rgba.set(src.rgba.subarray(s, s + 4), (dy * dst.width + dx) * 4);
    }
  }
  return clipped;
}
