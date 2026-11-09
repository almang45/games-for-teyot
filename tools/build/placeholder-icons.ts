import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { encodePng, type Rgba } from './png.ts';

/** Sizes from ASSETS.md §5 (`icons/`); contracts v1 pins these names in the asset manifest. */
export const ICONS = [
  { file: 'icons/icon-192.png', size: 192, inset: 0.12 },
  { file: 'icons/icon-512.png', size: 512, inset: 0.12 },
  // Maskable icons keep their content inside the central 80% safe zone.
  { file: 'icons/maskable-512.png', size: 512, inset: 0.24 },
  { file: 'icons/apple-touch-icon-180.png', size: 180, inset: 0.14 },
] as const;

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
 * Serves placeholder icons in dev and emits them into the build. A real icon in assets/icons/
 * with the same name takes precedence, so swapping in final art needs no code change.
 */
export function placeholderIcons(root: string): Plugin {
  const load = (file: string, size: number, inset: number): Buffer => {
    const delivered = resolve(root, 'assets', file);
    return existsSync(delivered) ? readFileSync(delivered) : drawPlaceholderIcon(size, inset);
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
        res.end(load(icon.file, icon.size, icon.inset));
      });
    },
    generateBundle() {
      for (const icon of ICONS) {
        this.emitFile({
          type: 'asset',
          fileName: icon.file,
          source: load(icon.file, icon.size, icon.inset),
        });
      }
    },
  };
}
