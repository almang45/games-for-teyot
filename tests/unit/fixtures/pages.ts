import type { DecodedPng, Rgba } from '../../../tools/build/png';

export const WHITE: Rgba = [255, 255, 255, 255];
export const BLACK: Rgba = [0, 0, 0, 255];

export function page(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgba,
): DecodedPng {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, rgba };
}

/**
 * Line art: a frame inset from the page edge, split into `cols` × `rows` cells by lines of the
 * given thickness. Regions: one per cell plus the background around the frame, which is 40 px
 * wide at the sides and 30 px at top and bottom unless `inset` sets all four.
 */
export function gridPage(opts: {
  width?: number;
  height?: number;
  cols: number;
  rows: number;
  line?: number;
  inset?: number;
  gap?: { x: number; y: number; size: number };
  extra?: (x: number, y: number) => Rgba | undefined;
}): DecodedPng {
  const { width = 480, height = 300, cols, rows, line = 8 } = opts;
  const [insetX, insetY] = opts.inset === undefined ? [40, 30] : [opts.inset, opts.inset];
  const [left, top, right, bottom] = [insetX, insetY, width - insetX, height - insetY];
  const onLine = (v: number, start: number, end: number, n: number): boolean => {
    for (let i = 0; i <= n; i++) {
      const at = start + Math.round(((end - start - line) * i) / n);
      if (v >= at && v < at + line) return true;
    }
    return false;
  };
  return page(width, height, (x, y) => {
    const custom = opts.extra?.(x, y);
    if (custom) return custom;
    const g = opts.gap;
    if (g && x >= g.x && x < g.x + g.size && y >= g.y && y < g.y + g.size) return WHITE;
    const inside = x >= left && x < right && y >= top && y < bottom;
    if (!inside) return WHITE;
    return onLine(x, left, right, cols) || onLine(y, top, bottom, rows) ? BLACK : WHITE;
  });
}
