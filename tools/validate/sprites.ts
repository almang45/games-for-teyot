import { error, type Issue } from '../../contracts/common.ts';
import { familyOf, type ManifestEntry, type Stance } from '../../contracts/manifest.ts';
import type { DecodedPng } from '../build/png.ts';

type SheetEntry = Extract<ManifestEntry, { type: 'spritesheet' }>;

/** A pixel at least this opaque counts as part of the figure; softer edges and glow don't. */
export const OPAQUE = 128;
/** How far a frame's soles may sit from the baseline, in px. */
export const BASELINE_SLACK = 1;
/** How far the rest pose may stray from the stand height, as a share of it. */
export const STAND_SLACK = 0.04;

/** Top and bottom opaque rows of a figure, or undefined for an empty frame. */
export interface Extent {
  readonly top: number;
  readonly bottom: number;
}

/** The opaque rows of one frame of a sheet. */
export function frameExtent(
  png: DecodedPng,
  frame: number,
  size: readonly [number, number],
): Extent | undefined {
  const [fw, fh] = size;
  const perRow = Math.floor(png.width / fw);
  const x0 = (frame % perRow) * fw;
  const y0 = Math.floor(frame / perRow) * fh;
  let top: number | undefined;
  let bottom: number | undefined;
  for (let y = 0; y < fh; y++) {
    const row = (y0 + y) * png.width;
    for (let x = 0; x < fw; x++) {
      if ((png.rgba[(row + x0 + x) * 4 + 3] ?? 0) >= OPAQUE) {
        top ??= y;
        bottom = y;
        break;
      }
    }
  }
  return top === undefined || bottom === undefined ? undefined : { top, bottom };
}

function checkStance(
  extent: Extent,
  stance: Stance,
  frame: number,
  at: string,
  restPose: boolean,
): Issue[] {
  const issues: Issue[] = [];
  if (Math.abs(extent.bottom - stance.baseline) > BASELINE_SLACK) {
    issues.push(
      error(
        at,
        `frame ${frame} stands on row ${extent.bottom}, not the baseline ${stance.baseline}`,
      ),
    );
  }
  const height = extent.bottom - extent.top + 1;
  if (restPose && Math.abs(height - stance.standHeight) > stance.standHeight * STAND_SLACK) {
    issues.push(
      error(
        at,
        `the rest pose (frame ${frame}) is ${height} px tall, not ${stance.standHeight} ± ${Math.round(STAND_SLACK * 100)}%`,
      ),
    );
  }
  return issues;
}

/**
 * ASSETS.md §3 rules that live in the pixels (#55): no empty frames, feet on the baseline, and
 * the rest pose at the family's stand height, so relative scale holds on every frame.
 * Run after checkImageSize: frames past the end of the sheet are skipped here.
 */
export function checkSheetPixels(entry: SheetEntry, png: DecodedPng, at: string): Issue[] {
  const stance = familyOf(entry.key)?.stance;
  const count = Math.floor(png.width / entry.frame[0]) * Math.floor(png.height / entry.frame[1]);
  const issues: Issue[] = [];
  const seen = new Set<number>();
  for (const [name, anim] of Object.entries(entry.animations)) {
    const path = `${at}.animations.${name}`;
    for (let frame = anim.frames[0]; frame <= Math.min(anim.frames[1], count - 1); frame++) {
      if (seen.has(frame)) continue;
      seen.add(frame);
      const extent = frameExtent(png, frame, entry.frame);
      if (!extent) {
        issues.push(error(path, `frame ${frame} is empty`));
        continue;
      }
      const restPose = name === 'idle.fr' && frame === anim.frames[0];
      if (stance) issues.push(...checkStance(extent, stance, frame, path, restPose));
    }
  }
  return issues;
}
