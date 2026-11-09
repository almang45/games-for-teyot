import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ICONS, drawPlaceholderIcon, placeholderIcons } from '../../tools/build/placeholder-icons';
import { encodePng } from '../../tools/build/png';

function readIhdr(png: Buffer): { width: number; height: number; colorType: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), colorType: png[25] ?? -1 };
}

describe('encodePng', () => {
  it('writes a valid signature, header, and pixel data', () => {
    const png = encodePng(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 128]));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(readIhdr(png)).toEqual({ width: 2, height: 1, colorType: 6 });
    const idatLength = png.readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 0, 255, 128]);
  });
});

describe('placeholder icons', () => {
  it.each(ICONS)('$file is $size × $size', ({ size, inset }) => {
    expect(readIhdr(drawPlaceholderIcon(size, inset))).toMatchObject({ width: size, height: size });
  });
});

describe('placeholderIcons plugin', () => {
  interface FakeRes {
    headers: Record<string, string>;
    body?: Buffer;
    setHeader(k: string, v: string): void;
    end(b: Buffer): void;
  }
  type Middleware = (req: { url?: string }, res: FakeRes, next: () => void) => void;

  const fakeRes = (): FakeRes => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(b) {
      this.body = b;
    },
  });

  it('serves icons in dev and passes other requests through', () => {
    const middlewares: Middleware[] = [];
    const server = { middlewares: { use: (fn: Middleware) => middlewares.push(fn) } };
    (
      placeholderIcons('/nonexistent-root').configureServer as unknown as (s: typeof server) => void
    )(server);
    const middleware = middlewares[0];
    if (!middleware) throw new Error('no middleware registered');

    const res = fakeRes();
    let passed = false;
    middleware({ url: '/icons/icon-192.png?v=1' }, res, () => (passed = true));
    expect(passed).toBe(false);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.body && readIhdr(res.body).width).toBe(192);

    middleware({ url: '/src/main.ts' }, fakeRes(), () => (passed = true));
    expect(passed).toBe(true);
  });

  it('emits every icon into the bundle', () => {
    const emitted: string[] = [];
    const ctx = { emitFile: (f: { fileName: string }) => emitted.push(f.fileName) };
    (
      placeholderIcons('/nonexistent-root').generateBundle as unknown as (this: typeof ctx) => void
    ).call(ctx);
    expect(emitted).toEqual(ICONS.map((i) => i.file));
  });
});
