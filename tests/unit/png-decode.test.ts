import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, pngChunk, readPngHeader } from '../../tools/build/png';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Encodes raw rows with the given filter per row, the way real encoders do. */
function filteredPng(opts: {
  width: number;
  height: number;
  colorType: number;
  bpp: number;
  rows: number[][];
  filters: number[];
  bitDepth?: number;
  interlace?: number;
  extra?: Buffer[];
}): Buffer {
  const { width, height, colorType, bpp, rows, filters } = opts;
  const out: number[] = [];
  rows.forEach((row, y) => {
    const filter = filters[y] ?? 0;
    out.push(filter);
    const prev = rows[y - 1];
    row.forEach((v, x) => {
      const a = x >= bpp ? (row[x - bpp] ?? 0) : 0;
      const b = prev?.[x] ?? 0;
      const c = x >= bpp ? (prev?.[x - bpp] ?? 0) : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter] ?? 0;
      out.push((v - predicted + 256) & 0xff);
    });
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = opts.bitDepth ?? 8;
  header[9] = colorType;
  header[12] = opts.interlace ?? 0;
  return Buffer.concat([
    SIGNATURE,
    pngChunk('IHDR', header),
    ...(opts.extra ?? []),
    pngChunk('IDAT', deflateSync(Buffer.from(out))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('readPngHeader', () => {
  it('reads the IHDR fields', () => {
    expect(readPngHeader(encodePng(3, 2, () => [0, 0, 0, 255]))).toEqual({
      width: 3,
      height: 2,
      bitDepth: 8,
      colorType: 6,
      interlace: 0,
    });
  });

  it('rejects files that are not PNG', () => {
    expect(() => readPngHeader(Buffer.from('GIF89a, clearly not a png file at all'))).toThrow(
      'not a PNG file',
    );
    const noIhdr = Buffer.concat([SIGNATURE, pngChunk('IDAT', Buffer.alloc(13)), Buffer.alloc(8)]);
    expect(() => readPngHeader(noIhdr)).toThrow('missing its IHDR');
  });
});

describe('decodePng', () => {
  it('round-trips the encoder', () => {
    const png = encodePng(2, 2, (x, y) => [x * 100, y * 100, 7, 255 - x]);
    expect([...decodePng(png).rgba]).toEqual([
      0, 0, 7, 255, 100, 0, 7, 254, 0, 100, 7, 255, 100, 100, 7, 254,
    ]);
  });

  it('undoes every row filter on RGB', () => {
    const rows = [
      [10, 20, 30, 200, 210, 220, 5, 6, 7],
      [11, 21, 31, 201, 211, 221, 255, 0, 128],
      [90, 80, 70, 60, 50, 40, 30, 20, 10],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [250, 3, 250, 3, 250, 3, 250, 3, 250],
    ];
    const png = filteredPng({
      width: 3,
      height: 5,
      colorType: 2,
      bpp: 3,
      rows,
      filters: [1, 2, 3, 4, 0],
    });
    const { rgba } = decodePng(png);
    const rgb = [...rgba].filter((_, i) => i % 4 !== 3);
    expect(rgb).toEqual(rows.flat());
  });

  it('expands gray, gray + alpha and palette pixels', () => {
    const gray = filteredPng({
      width: 2,
      height: 1,
      colorType: 0,
      bpp: 1,
      rows: [[0, 200]],
      filters: [0],
    });
    expect([...decodePng(gray).rgba]).toEqual([0, 0, 0, 255, 200, 200, 200, 255]);

    const grayAlpha = filteredPng({
      width: 1,
      height: 1,
      colorType: 4,
      bpp: 2,
      rows: [[90, 10]],
      filters: [0],
    });
    expect([...decodePng(grayAlpha).rgba]).toEqual([90, 90, 90, 10]);

    const palette = filteredPng({
      width: 3,
      height: 1,
      colorType: 3,
      bpp: 1,
      rows: [[0, 1, 2]],
      filters: [0],
      extra: [
        pngChunk('PLTE', Buffer.from([255, 0, 0, 0, 255, 0])),
        pngChunk('tRNS', Buffer.from([128])),
      ],
    });
    // Index 2 is past the palette: decoded as black rather than throwing, validators then flag it.
    expect([...decodePng(palette).rgba]).toEqual([255, 0, 0, 128, 0, 255, 0, 255, 0, 0, 0, 255]);
  });

  it('rejects formats it does not inspect', () => {
    const sixteen = filteredPng({
      width: 1,
      height: 1,
      colorType: 2,
      bpp: 6,
      rows: [[0, 0, 0, 0, 0, 0]],
      filters: [0],
      bitDepth: 16,
    });
    expect(() => decodePng(sixteen)).toThrow(
      'unsupported PNG format (bit depth 16, colour type 2)',
    );
    const interlaced = filteredPng({
      width: 1,
      height: 1,
      colorType: 0,
      bpp: 1,
      rows: [[0]],
      filters: [0],
      interlace: 1,
    });
    expect(() => decodePng(interlaced)).toThrow('interlaced PNG');
    const noPalette = filteredPng({
      width: 1,
      height: 1,
      colorType: 3,
      bpp: 1,
      rows: [[0]],
      filters: [0],
    });
    expect(() => decodePng(noPalette)).toThrow('palette PNG without a PLTE chunk');
  });

  it('rejects broken data', () => {
    const badFilter = filteredPng({
      width: 1,
      height: 1,
      colorType: 0,
      bpp: 1,
      rows: [[0]],
      filters: [9],
    });
    expect(() => decodePng(badFilter)).toThrow('PNG row 0 has unknown filter type 9');
    const short = filteredPng({
      width: 4,
      height: 4,
      colorType: 0,
      bpp: 1,
      rows: [[0, 0, 0, 0]],
      filters: [0],
    });
    expect(() => decodePng(short)).toThrow('PNG pixel data is truncated');
    const png = encodePng(2, 2, () => [0, 0, 0, 255]);
    expect(() => decodePng(png.subarray(0, png.length - 20))).toThrow(/truncated/);
  });
});
