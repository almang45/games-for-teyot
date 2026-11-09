import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { manifest } from '../../contracts/manifest.ts';
import { resolveWithoutLinks } from './no-links.ts';
import { encodePng, type Rgba } from './png.ts';

/**
 * App icons by manifest key (contracts/manifest.ts, `icons.app.*`). `file` is the public URL the
 * web manifest and index.html point at, so it stays fixed whatever path the art is stored under.
 */
export const ICONS = [
  { key: 'icons.app.192', file: 'icons/icon-192.png', size: 192, inset: 0.12 },
  { key: 'icons.app.512', file: 'icons/icon-512.png', size: 512, inset: 0.12 },
  // Maskable icons keep their content inside the central 80% safe zone.
  { key: 'icons.app.maskable-512', file: 'icons/maskable-512.png', size: 512, inset: 0.24 },
  {
    key: 'icons.app.apple-touch-180',
    file: 'icons/apple-touch-icon-180.png',
    size: 180,
    inset: 0.14,
  },
] as const;

type Icon = (typeof ICONS)[number];

/**
 * Where each icon's delivered art lives: `assets/<path>` from the manifest entry with its key.
 * Unregistered keys fall back to the placeholder. A broken manifest, or a registered icon that is
 * missing or reached through a symlink, fails the build: validate:assets reports the details, and
 * shipping placeholders over real art would hide the breakage.
 */
export function deliveredIconPaths(root: string): ReadonlyMap<string, string> {
  // lstat, not existsSync: a dangling link must fail the build, not look like "no art yet".
  const lane = lstatSync(resolve(root, 'assets'), { throwIfNoEntry: false });
  if (!lane) return new Map();
  const manifestFile = lstatSync(resolve(root, 'assets', 'manifest.json'), {
    throwIfNoEntry: false,
  });
  if (!lane.isSymbolicLink() && !manifestFile) return new Map();
  const file = resolveWithoutLinks(root, 'assets/manifest.json');
  const parsed = manifest.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `assets/manifest.json is invalid (run npm run validate:assets): ${parsed.error.message}`,
    );
  }
  return new Map(
    parsed.data.assets
      .filter((a) => ICONS.some((i) => i.key === a.key))
      .map((a) => [a.key, resolveWithoutLinks(root, `assets/${a.path}`)]),
  );
}

const BACKGROUND: Rgba = [255, 214, 222, 255];
const WALL: Rgba = [255, 250, 240, 255];
const ROOF: Rgba = [239, 108, 98, 255];
const DOOR: Rgba = [141, 110, 99, 255];

/** A flat house glyph: roof triangle, wall block, door. */
export function drawPlaceholderIcon(size: number, inset: number): Buffer {
  const lo = size * inset;
  const hi = size * (1 - inset);
  const span = hi - lo;
  const roofBase = lo + span * 0.45;
  const wallLeft = lo + span * 0.15;
  const wallRight = hi - span * 0.15;
  const doorLeft = lo + span * 0.42;
  const doorRight = hi - span * 0.42;
  const doorTop = lo + span * 0.7;
  const mid = size / 2;

  return encodePng(size, size, (x, y) => {
    if (y >= lo && y < roofBase) {
      const halfWidth = ((y - lo) / (roofBase - lo)) * (span / 2);
      if (Math.abs(x - mid) <= halfWidth) return ROOF;
    }
    if (y >= roofBase && y < hi && x >= wallLeft && x < wallRight) {
      return y >= doorTop && x >= doorLeft && x < doorRight ? DOOR : WALL;
    }
    return BACKGROUND;
  });
}

/**
 * Serves app icons in dev and emits them into the build: the delivered art when the manifest
 * registers the key, the placeholder otherwise, so swapping in final art needs no code change.
 */
export function placeholderIcons(root: string): Plugin {
  const load = (icon: Icon): Buffer => {
    const delivered = deliveredIconPaths(root).get(icon.key);
    return delivered === undefined
      ? drawPlaceholderIcon(icon.size, icon.inset)
      : readFileSync(delivered);
  };
  return {
    name: 'rct-placeholder-icons',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]?.replace(/^\//, '');
        const icon = ICONS.find((i) => i.file === path);
        if (!icon) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'image/png');
        res.end(load(icon));
      });
    },
    generateBundle() {
      for (const icon of ICONS) {
        this.emitFile({
          type: 'asset',
          fileName: icon.file,
          source: load(icon),
        });
      }
    },
  };
}
