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

/** Squared Euclidean distance from every pixel to the nearest pixel of some kind. */
export interface DistanceField {
  readonly width: number;
  readonly height: number;
  readonly d2: Float32Array;
}

/** Stands in for "no such pixel on this line"; finite so the envelope maths stays NaN-free. */
const FAR = 1e20;

/**
 * One line of the exact squared distance transform (Felzenszwalb & Huttenlocher 2012): the lower
 * envelope of the parabolas rooted at each sample. Linear in `n`.
 */
function transformLine(
  f: Float64Array,
  n: number,
  out: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  const at = (i: number): number => f[i] ?? FAR;
  const root = (i: number): number => v[i] ?? 0;
  const cross = (q: number, p: number): number =>
    (at(q) + q * q - (at(p) + p * p)) / (2 * q - 2 * p);
  for (let q = 1; q < n; q++) {
    let s = cross(q, root(k));
    while (k > 0 && s <= (z[k] ?? -Infinity)) {
      k--;
      s = cross(q, root(k));
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const p = root(k);
    out[q] = (q - p) * (q - p) + at(p);
  }
}

/** Exact squared distance from every pixel to the nearest pixel whose mask value is `target`. */
function distanceTo(mask: Mask, target: 0 | 1): DistanceField {
  const { width, height, data } = mask;
  const d2 = new Float32Array(width * height);
  const longest = Math.max(width, height);
  const f = new Float64Array(longest);
  const out = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = data[y * width + x] === target ? 0 : FAR;
    transformLine(f, height, out, v, z);
    for (let y = 0; y < height; y++) d2[y * width + x] = out[y] ?? FAR;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = d2[row + x] ?? FAR;
    transformLine(f, width, out, v, z);
    for (let x = 0; x < width; x++) d2[row + x] = out[x] ?? FAR;
  }
  return { width, height, d2 };
}

export const distanceToLines = (mask: Mask): DistanceField => distanceTo(mask, 1);

/**
 * Distance to paper, where everything outside the page counts as paper too, so erosion trims
 * lines at the border. The nearest outside pixel is always straight across the nearest edge.
 */
export function distanceToPaper(mask: Mask): DistanceField {
  const field = distanceTo(mask, 0);
  const { width, height, d2 } = field;
  for (let y = 0; y < height; y++) {
    const edgeY = Math.min(y + 1, height - y);
    for (let x = 0; x < width; x++) {
      const edge = Math.min(Math.min(x + 1, width - x), edgeY);
      const i = y * width + x;
      d2[i] = Math.min(d2[i] ?? FAR, edge * edge);
    }
  }
  return field;
}

/** Pixels within `radius` (a disc, inclusive) of the field's pixels. */
export function within(field: DistanceField, radius: number): Mask {
  const { width, height, d2 } = field;
  const limit = radius * radius;
  const data = new Uint8Array(d2.length);
  for (let i = 0; i < d2.length; i++) data[i] = (d2[i] ?? FAR) <= limit ? 1 : 0;
  return { width, height, data };
}

/** Grows lines by a disc of `radius`. */
export const dilate = (mask: Mask, radius: number): Mask => within(distanceToLines(mask), radius);

/** Shrinks lines by a disc of `radius`: a pixel stays only if no paper lies within it. */
export function erode(mask: Mask, radius: number): Mask {
  const grownPaper = within(distanceToPaper(mask), radius);
  const data = grownPaper.data.map((v) => 1 - v);
  return { width: mask.width, height: mask.height, data };
}

/** The radius that closes gaps up to `gap` px: lines grow by half the gap on each side. */
export const closingRadius = (gap: number): number => Math.ceil(gap / 2);

/**
 * Closes gaps up to `gap` px by growing lines by a disc of `closingRadius(gap)`, the same pixels
 * `dilate` gives. The fill then stops at the grown lines, which the original art hides underneath.
 * It runs on every page load, so it paints a few short spans per line pixel instead of computing
 * a whole distance field.
 */
export function closeGaps(mask: Mask, gap = GAP_CLOSE_PX): Mask {
  const { width, height, data } = mask;
  const r = closingRadius(gap);
  // The disc's half-width on each row offset: (dx, dy) is inside when dx² + dy² ≤ r².
  const spans = Array.from({ length: 2 * r + 1 }, (_, k) => {
    const dy = k - r;
    return [dy, Math.floor(Math.sqrt(r * r - dy * dy))] as const;
  });
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 1) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dy, half] of spans) {
      const row = y + dy;
      if (row >= 0 && row < height) {
        const start = row * width;
        out.fill(1, start + Math.max(0, x - half), start + Math.min(width - 1, x + half) + 1);
      }
    }
  }
  return { width, height, data: out };
}

export interface Region {
  readonly id: number;
  /** Index of its first pixel in row-major order: one pixel that stands for the region. */
  readonly first: number;
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
  // Every pixel is pushed at most once (it is labelled on push), so one buffer always suffices.
  const stack = new Int32Array(data.length);
  for (let start = 0; start < data.length; start++) {
    if (data[start] === 1 || ids[start] !== 0) continue;
    const id = regions.length + 1;
    let area = 0;
    let [minX, minY, maxX, maxY] = [width, height, -1, -1];
    let top = 0;
    const visit = (n: number): void => {
      if (data[n] === 0 && ids[n] === 0) {
        ids[n] = id;
        stack[top++] = n;
      }
    };
    visit(start);
    while (top > 0) {
      const i = stack[--top] ?? 0;
      area++;
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) visit(i - 1);
      if (x < width - 1) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y < height - 1) visit(i + width);
    }
    const touchesBorder = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    regions.push({
      id,
      first: start,
      area,
      bounds: [minX, minY, maxX - minX + 1, maxY - minY + 1],
      touchesBorder,
    });
  }
  return { ids, regions };
}

/**
 * Regions that hold a `side` × `side` square of their own pixels, i.e. somewhere a finger fits.
 * Run lengths per row, then per column over the rows that are long enough. Linear in pixels.
 */
export function regionsHoldingSquare(
  labels: Labels,
  width: number,
  side: number,
): ReadonlySet<number> {
  const { ids } = labels;
  const height = ids.length / width;
  const run = new Int32Array(ids.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const id = ids[i] ?? 0;
      if (id === 0) continue;
      run[i] = x > 0 && ids[i - 1] === id ? (run[i - 1] ?? 0) + 1 : 1;
    }
  }
  const found = new Set<number>();
  const column = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const id = ids[i] ?? 0;
      if (id === 0 || (run[i] ?? 0) < side) {
        column[x] = 0;
        continue;
      }
      const above = y > 0 && ids[i - width] === id && (run[i - width] ?? 0) >= side;
      const tall = above ? (column[x] ?? 0) + 1 : 1;
      column[x] = tall;
      if (tall >= side) found.add(id);
    }
  }
  return found;
}
