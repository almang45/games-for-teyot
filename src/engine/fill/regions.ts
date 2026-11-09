/**
 * Raster region analysis for coloring pages (ASSETS.md §6). The game fills regions at runtime and
 * validate:assets checks pages with the same code, so a page that passes CI fills the same way on
 * the tablet.
 */

/** 1 = line pixel, 0 = paper. Row-major. */
export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Darker than this (0–255 luminance) and opaque counts as line. Anti-aliased edges fall either way. */
export const LINE_THRESHOLD = 128;

/** Rec. 601 luma in integer math (× 1000), so the threshold is exact. */
const lumaMilli = (r: number, g: number, b: number): number => 299 * r + 587 * g + 114 * b;

/** Gaps up to this many px are closed when a page loads (ASSETS.md §6). */
export const GAP_CLOSE_PX = 2;

export function lineMask(rgba: Uint8Array, width: number, height: number): Mask {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const o = i * 4;
    const luma = lumaMilli(rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0);
    data[i] = (rgba[o + 3] ?? 0) >= 128 && luma < LINE_THRESHOLD * 1000 ? 1 : 0;
  }
  return { width, height, data };
}

/** Offsets of a disc of the given radius: grows lines evenly in every direction. */
export function disc(radius: number): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) out.push([dx, dy]);
    }
  }
  return out;
}

function morph(mask: Mask, radius: number, grow: boolean): Mask {
  const { width, height, data } = mask;
  const shape = disc(radius);
  const out = new Uint8Array(data.length);
  const target = grow ? 1 : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (const [dx, dy] of shape) {
        const nx = x + dx;
        const ny = y + dy;
        // Outside the page counts as paper, so erosion trims lines at the border too.
        const v =
          nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : (data[ny * width + nx] ?? 0);
        if (v === target) {
          hit = true;
          break;
        }
      }
      out[y * width + x] = hit === grow ? 1 : 0;
    }
  }
  return { width, height, data: out };
}

export const dilate = (mask: Mask, radius: number): Mask => morph(mask, radius, true);
export const erode = (mask: Mask, radius: number): Mask => morph(mask, radius, false);

/**
 * Closes gaps up to `gap` px: grows every line by half the gap on each side. The fill then
 * stops at the grown lines, which the original art hides underneath.
 */
export const closeGaps = (mask: Mask, gap = GAP_CLOSE_PX): Mask => dilate(mask, Math.ceil(gap / 2));

export interface Region {
  readonly id: number;
  readonly area: number;
  /** [x, y, width, height]. */
  readonly bounds: readonly [number, number, number, number];
  readonly touchesBorder: boolean;
}

export interface Labels {
  /** Region id per pixel, 0 for line pixels. */
  readonly ids: Int32Array;
  readonly regions: readonly Region[];
}

/** 4-connected paper regions: fill never leaks through a diagonal pinch between two line pixels. */
export function labelRegions(mask: Mask): Labels {
  const { width, height, data } = mask;
  const ids = new Int32Array(data.length);
  const regions: Region[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start] === 1 || ids[start] !== 0) continue;
    const id = regions.length + 1;
    let area = 0;
    let [minX, minY, maxX, maxY] = [width, height, -1, -1];
    ids[start] = id;
    stack.push(start);
    for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
      area++;
      const x = i % width;
      const y = (i - x) / width;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbours = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && data[n] === 0 && ids[n] === 0) {
          ids[n] = id;
          stack.push(n);
        }
      }
    }
    const touchesBorder = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    regions.push({
      id,
      area,
      bounds: [minX, minY, maxX - minX + 1, maxY - minY + 1],
      touchesBorder,
    });
  }
  return { ids, regions };
}
