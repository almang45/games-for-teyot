import { error, type Issue } from '../../contracts/common.ts';
import {
  closeGaps,
  dilate,
  erode,
  labelRegions,
  lineMask,
  type Mask,
} from '../../src/engine/fill/regions.ts';
import type { DecodedPng } from '../build/png.ts';

/** ASSETS.md §6, as numbers. */
export const COLORING_RULES = {
  minRegions: 6,
  maxRegions: 15,
  /** A fillable region's bounding box is at least this big; smaller pockets are just lines. */
  minRegionPx: 40,
  /** Lines are ≥ 6 px; a radius-2 opening keeps lines ≥ 5 px, which leaves room for anti-aliasing. */
  thinLineRadius: 2,
  /** Share of line pixels allowed to be thinner (stroke tips, sharp corners). */
  maxThinShare: 0.05,
  /** Share of the page allowed to be colour, or grey away from a line (anti-aliasing is fine). */
  maxColourShare: 0.001,
  maxGreyShare: 0.0005,
} as const;

const GREY_NEAR_LINE_PX = 2;

export interface ColoringReport {
  readonly issues: Issue[];
  readonly regions: number;
}

const share = (count: number, total: number): string => `${((count / total) * 100).toFixed(2)}%`;

function countWhere(n: number, test: (i: number) => boolean): number {
  let count = 0;
  for (let i = 0; i < n; i++) if (test(i)) count++;
  return count;
}

function paperIssues(png: DecodedPng, lines: Mask, path: string): Issue[] {
  const { rgba } = png;
  const total = png.width * png.height;
  const issues: Issue[] = [];
  const channel = (i: number, k: number): number => rgba[i * 4 + k] ?? 0;

  const transparent = countWhere(total, (i) => channel(i, 3) < 255);
  if (transparent > 0)
    issues.push(error(path, `page must be opaque: ${transparent} transparent pixels`));

  const coloured = countWhere(total, (i) => {
    const [r, g, b] = [channel(i, 0), channel(i, 1), channel(i, 2)];
    return Math.max(r, g, b) - Math.min(r, g, b) > 24;
  });
  if (coloured / total > COLORING_RULES.maxColourShare) {
    issues.push(
      error(
        path,
        `pages are black lines on white, but ${share(coloured, total)} of pixels are coloured`,
      ),
    );
  }

  const nearLine = dilate(lines, GREY_NEAR_LINE_PX).data;
  const grey = countWhere(total, (i) => {
    const lum = (channel(i, 0) + channel(i, 1) + channel(i, 2)) / 3;
    return lum >= 32 && lum <= 223 && nearLine[i] === 0;
  });
  if (grey / total > COLORING_RULES.maxGreyShare) {
    issues.push(
      error(path, `${share(grey, total)} of the page is grey away from any line: no grey patches`),
    );
  }
  return issues;
}

function lineIssues(lines: Mask, path: string): Issue[] {
  const r = COLORING_RULES.thinLineRadius;
  const opened = dilate(erode(lines, r), r).data;
  const total = countWhere(lines.data.length, (i) => lines.data[i] === 1);
  const thin = countWhere(lines.data.length, (i) => lines.data[i] === 1 && opened[i] === 0);
  if (total === 0) return [error(path, 'page has no line art')];
  return thin / total > COLORING_RULES.maxThinShare
    ? [error(path, `${share(thin, total)} of the line art is thinner than 6 px`)]
    : [];
}

/**
 * Checks a decoded coloring page against ASSETS.md §6: opaque black-on-white line art, lines
 * ≥ 6 px, and 6–15 fillable regions after the game's 2 px gap closing. A leak (a gap wider than
 * 2 px) merges two regions, so it usually shows up as a missing region.
 */
export function checkColoringPage(png: DecodedPng, path: string): ColoringReport {
  const lines = lineMask(png.rgba, png.width, png.height);
  const issues = [...paperIssues(png, lines, path), ...lineIssues(lines, path)];
  const { regions } = labelRegions(closeGaps(lines));
  const min = COLORING_RULES.minRegionPx;
  const fillable = regions.filter((r) => r.bounds[2] >= min && r.bounds[3] >= min).length;
  if (fillable < COLORING_RULES.minRegions || fillable > COLORING_RULES.maxRegions) {
    issues.push(
      error(
        path,
        `${fillable} fillable regions (≥ ${min} × ${min} px) after closing 2 px gaps; a page has ${COLORING_RULES.minRegions}–${COLORING_RULES.maxRegions}. Too few usually means a gap leaks.`,
      ),
    );
  }
  return { issues, regions: fillable };
}
