import { crc32, deflateSync, inflateSync } from 'node:zlib';

export type Rgba = readonly [number, number, number, number];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Minimal RGBA8 PNG encoder; enough for code-generated placeholders without an image dependency. */
export function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgba,
): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  return Buffer.concat([
    SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  return out;
}

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly interlace: number;
}

/** Reads the IHDR chunk only, so size checks never decode the pixels. */
export function readPngHeader(png: Buffer): PngHeader {
  if (png.length < 33 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  if (png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG is missing its IHDR chunk');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png.readUInt8(24),
    colorType: png.readUInt8(25),
    interlace: png.readUInt8(28),
  };
}

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** RGBA8, row-major. */
  readonly rgba: Uint8Array;
}

/** Bytes per pixel for 8-bit gray, RGB, palette, gray + alpha, RGBA. */
const CHANNELS: ReadonlyMap<number, number> = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

interface Chunk {
  readonly type: string;
  readonly data: Buffer;
}

function readChunks(png: Buffer): Chunk[] {
  const out: Chunk[] = [];
  let at = 8;
  while (at + 8 <= png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    if (at + 12 + length > png.length) throw new Error(`PNG chunk ${type} is truncated`);
    out.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function predictor(filter: number, left: number, up: number, upLeft: number, row: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, upLeft);
    default:
      throw new Error(`PNG row ${row} has unknown filter type ${filter}`);
  }
}

/** Undoes the per-row filters (PNG spec §9). */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new Error('PNG pixel data is truncated');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(y * (stride + 1));
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? (out[row + x - bpp] ?? 0) : 0;
      const up = y > 0 ? (out[row - stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= bpp ? (out[row - stride + x - bpp] ?? 0) : 0;
      out[row + x] = ((raw[src + x] ?? 0) + predictor(filter, left, up, upLeft, y)) & 0xff;
    }
  }
  return out;
}

/**
 * Gray and RGB PNGs mark one colour fully transparent with tRNS: a 16-bit sample per channel
 * (PNG spec §11.3.2.1), of which an 8-bit image uses the low byte.
 */
function keyed(trns: Buffer | undefined, sample: readonly number[]): number {
  if (!trns || trns.length < sample.length * 2) return 255;
  return sample.every((value, k) => trns.readUInt16BE(k * 2) === value) ? 0 : 255;
}

function toRgba(
  pixels: Uint8Array,
  count: number,
  colorType: number,
  palette: Buffer | undefined,
  alpha: Buffer | undefined,
): Uint8Array {
  const bpp = CHANNELS.get(colorType) ?? 4;
  const rgba = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const s = i * bpp;
    const v = (k: number): number => pixels[s + k] ?? 0;
    let px: Rgba;
    if (colorType === 0) px = [v(0), v(0), v(0), keyed(alpha, [v(0)])];
    else if (colorType === 2) px = [v(0), v(1), v(2), keyed(alpha, [v(0), v(1), v(2)])];
    else if (colorType === 4) px = [v(0), v(0), v(0), v(1)];
    else if (colorType === 3) {
      const p = v(0) * 3;
      px = [palette?.[p] ?? 0, palette?.[p + 1] ?? 0, palette?.[p + 2] ?? 0, alpha?.[v(0)] ?? 255];
    } else px = [v(0), v(1), v(2), v(3)];
    rgba.set(px, i * 4);
  }
  return rgba;
}

/**
 * Minimal decoder for what validate:assets inspects pixel by pixel (coloring pages): 8-bit,
 * non-interlaced gray, RGB, palette, gray + alpha and RGBA. Anything else is rejected with a
 * reason, so the art gets re-exported instead of half-checked.
 */
export function decodePng(png: Buffer): DecodedPng {
  const { width, height, bitDepth, colorType, interlace } = readPngHeader(png);
  const bpp = CHANNELS.get(colorType);
  if (bitDepth !== 8 || bpp === undefined) {
    throw new Error(
      `unsupported PNG format (bit depth ${bitDepth}, colour type ${colorType}): export 8-bit RGB or RGBA`,
    );
  }
  if (interlace !== 0) throw new Error('interlaced PNG: export without interlacing');
  const chunks = readChunks(png);
  const palette = chunks.find((c) => c.type === 'PLTE')?.data;
  if (colorType === 3 && !palette) throw new Error('palette PNG without a PLTE chunk');
  const alpha = chunks.find((c) => c.type === 'tRNS')?.data;
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const pixels = unfilter(inflateSync(idat), width, height, bpp);
  return { width, height, rgba: toRgba(pixels, width * height, colorType, palette, alpha) };
}
