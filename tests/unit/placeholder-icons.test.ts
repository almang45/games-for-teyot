import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ICONS,
  deliveredIconPaths,
  drawPlaceholderIcon,
  placeholderIcons,
} from '../../tools/build/placeholder-icons';
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

describe('delivered icons', () => {
  const roots: string[] = [];
  const makeRoot = (manifestJson?: string, files: Record<string, Buffer> = {}): string => {
    // Real path: the temp dir is itself a symlink on macOS (/var → /private/var).
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'rct-icons-')));
    roots.push(root);
    if (manifestJson !== undefined) {
      mkdirSync(join(root, 'assets'), { recursive: true });
      writeFileSync(join(root, 'assets', 'manifest.json'), manifestJson);
    }
    for (const [file, bytes] of Object.entries(files)) {
      mkdirSync(dirname(join(root, 'assets', file)), { recursive: true });
      writeFileSync(join(root, 'assets', file), bytes);
    }
    return root;
  };
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  const emit = (root: string): Map<string, Buffer> => {
    const out = new Map<string, Buffer>();
    const ctx = {
      emitFile: (f: { fileName: string; source: Buffer }) => out.set(f.fileName, f.source),
    };
    (placeholderIcons(root).generateBundle as unknown as (this: typeof ctx) => void).call(ctx);
    return out;
  };

  it('uses the art registered under the icon key, at the fixed public URL', () => {
    const art = encodePng(192, 192, () => [1, 2, 3, 255]);
    const manifestJson = JSON.stringify({
      version: 1,
      assets: [
        { key: 'icons.app.192', type: 'image', path: 'brand/app-icon-small.png', room: 'global' },
        { key: 'ui.home', type: 'image', path: 'ui/home.png', room: 'global' },
      ],
    });
    const root = makeRoot(manifestJson, { 'brand/app-icon-small.png': art });
    expect(deliveredIconPaths(root)).toEqual(
      new Map([['icons.app.192', join(root, 'assets', 'brand/app-icon-small.png')]]),
    );
    const emitted = emit(root);
    expect(emitted.get('icons/icon-192.png')).toEqual(art);
    const placeholder = emitted.get('icons/icon-512.png');
    expect(placeholder && readIhdr(placeholder).width).toBe(512);
  });

  it('falls back to placeholders without a manifest', () => {
    expect(deliveredIconPaths(makeRoot())).toEqual(new Map());
  });

  it('refuses icons reached through a symlink, so private files never reach dist/', () => {
    const manifestJson = JSON.stringify({
      version: 1,
      assets: [{ key: 'icons.app.192', type: 'image', path: 'brand/icon.png', room: 'global' }],
    });
    const root = makeRoot(manifestJson, {
      'private/icon.png': encodePng(1, 1, () => [0, 0, 0, 255]),
    });
    symlinkSync(join(root, 'assets', 'private'), join(root, 'assets', 'brand'));
    expect(() => deliveredIconPaths(root)).toThrow('brand/icon.png goes through a symlink');
  });

  it('fails the build on an invalid manifest instead of hiding the art', () => {
    const root = makeRoot(JSON.stringify({ version: 1, assets: [{ key: 'icons.app.192' }] }));
    expect(() => deliveredIconPaths(root)).toThrow(/assets\/manifest\.json is invalid/);
  });
});
