import { error, type Issue } from '../../contracts/common.ts';
import {
  closingRadius,
  dilate,
  distanceToLines,
  erode,
  GAP_CLOSE_PX,
  labelRegions,
  lineMask,
  regionsHoldingSquare,
  within,
  type DistanceField,
  type Labels,
  type Mask,
} from '../../src/engine/fill/regions.ts';
import type { DecodedPng } from '../build/png.ts';

/** ASSETS.md §6, as numbers. */
export const COLORING_RULES = {
  minRegions: 6,
  maxRegions: 15,
  /** A fillable region holds a square this big; narrower pockets and slivers are just lines. */
  minRegionPx: 40,
  /**
   * Openings up to this wide that the 2 px closing leaves open count as leaks: a region that
   * splits in two when they close was joined by a gap, not by a deliberate passage.
   */
  leakProbePx: 8,
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

function paperIssues(png: DecodedPng, distance: DistanceField, path: string): Issue[] {
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

  const nearLine = within(distance, GREY_NEAR_LINE_PX).data;
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

const fillable = (labels: Labels, width: number): ReadonlySet<number> =>
  regionsHoldingSquare(labels, width, COLORING_RULES.minRegionPx);

/**
 * Closes openings up to `leakProbePx` as well and looks for a fillable region that falls apart
 * into two or more fillable regions: those were joined only through a narrow opening, which is
 * how a leak looks. Catches leaks the region count misses when the total still lands in 6–15.
 */
function leakIssues(lines: Mask, closed: Labels, distance: DistanceField, path: string): Issue[] {
  const probed = labelRegions(within(distance, closingRadius(COLORING_RULES.leakProbePx)));
  const probedFillable = fillable(probed, lines.width);
  // Pieces that matter: somewhere to fill, or the background around the subject.
  const significant = (piece: number): boolean =>
    probedFillable.has(piece) || probed.regions[piece - 1]?.touchesBorder === true;
  const pieces = new Map<number, Set<number>>();
  probed.ids.forEach((piece, i) => {
    const region = closed.ids[i] ?? 0;
    if (piece === 0 || region === 0 || !significant(piece)) return;
    const set = pieces.get(region) ?? new Set<number>();
    set.add(piece);
    pieces.set(region, set);
  });
  const issues: Issue[] = [];
  for (const [id, set] of pieces) {
    const region = closed.regions[id - 1];
    const inner = [...set].filter(
      (p) => probedFillable.has(p) && probed.regions[p - 1]?.touchesBorder !== true,
    );
    // A background that only narrows near the page edge is not a leak.
    if (!region || set.size < 2 || inner.length === 0) continue;
    const into = set.size > inner.length ? ', leaking into the background' : '';
    issues.push(
      error(
        path,
        `${set.size} areas in [${region.bounds.join(', ')}] join through an opening of ${GAP_CLOSE_PX + 1}–${COLORING_RULES.leakProbePx} px${into}: close the gap, or widen a deliberate passage past ${COLORING_RULES.leakProbePx} px`,
      ),
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
 * ≥ 6 px, no leaks, and 6–15 fillable regions after the game's 2 px gap closing.
 */
export function checkColoringPage(png: DecodedPng, path: string): ColoringReport {
  const lines = lineMask(png.rgba, png.width, png.height);
  // One distance field serves the gap closing, the leak probe and the grey-near-line test.
  const distance = distanceToLines(lines);
  const issues = [...paperIssues(png, distance, path), ...lineIssues(lines, path)];
  const closed = labelRegions(within(distance, closingRadius(GAP_CLOSE_PX)));
  const closedFillable = fillable(closed, lines.width);
  issues.push(...leakIssues(lines, closed, distance, path));
  const count = closedFillable.size;
  const min = COLORING_RULES.minRegionPx;
  if (count < COLORING_RULES.minRegions || count > COLORING_RULES.maxRegions) {
    issues.push(
      error(
        path,
        `${count} fillable regions (holding ${min} × ${min} px) after closing ${GAP_CLOSE_PX} px gaps; a page has ${COLORING_RULES.minRegions}–${COLORING_RULES.maxRegions}`,
      ),
    );
  }
  return { issues, regions: count };
}
