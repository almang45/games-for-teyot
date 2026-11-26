import { OPAQUE } from '../validate/sprites.ts';
import { alphaAt, crop, type Raster } from './raster.ts';

export interface Panels {
  /** One crop per figure, left to right, each spanning the strip's full height. */
  readonly panels: readonly Raster[];
  /** How many column groups were joined to reach the expected count. */
  readonly merged: number;
}

interface Run {
  start: number;
  end: number;
}

/** Runs of columns holding any opaque pixel. */
function columnRuns(r: Raster): Run[] {
  const runs: Run[] = [];
  let open: Run | undefined;
  for (let x = 0; x < r.width; x++) {
    let filled = false;
    for (let y = 0; y < r.height && !filled; y++) filled = alphaAt(r, x, y) >= OPAQUE;
    if (filled && open) open.end = x;
    else if (filled) {
      open = { start: x, end: x };
      runs.push(open);
    } else open = undefined;
  }
  return runs;
}

const gapAfter = (runs: readonly Run[], i: number): number =>
  (runs[i + 1]?.start ?? 0) - (runs[i]?.end ?? 0);

/**
 * Splits a strip of poses laid out left to right into one panel per pose, by the empty columns
 * between them. A pose whose parts don't touch column-wise (a hand held out) shows up as extra
 * runs; gaps far narrower than the space between poses are joined until the count matches.
 */
export function splitPanels(r: Raster, expected: number): Panels {
  const runs = columnRuns(r);
  if (runs.length < expected) {
    throw new Error(
      `found ${runs.length} figures, expected ${expected}: leave clear space between the poses`,
    );
  }
  const gaps = runs.slice(1).map((run, i) => run.start - (runs[i]?.end ?? 0));
  const typical = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  let merged = 0;
  while (runs.length > expected) {
    let narrowest = 0;
    for (let i = 1; i < runs.length - 1; i++) {
      if (gapAfter(runs, i) < gapAfter(runs, narrowest)) narrowest = i;
    }
    // Only a gap far narrower than the space between poses is a detached part of one pose.
    if (gapAfter(runs, narrowest) * 2 >= typical) {
      throw new Error(
        `found ${runs.length} figures, expected ${expected}: one reference pose, then one pose per frame`,
      );
    }
    const left = runs[narrowest];
    const right = runs[narrowest + 1];
    if (left && right) left.end = right.end;
    runs.splice(narrowest + 1, 1);
    merged++;
  }
  // Cut halfway across each gap, so soft edges stay with their figure.
  const panels = runs.map((run, i) => {
    const prev = runs[i - 1];
    const next = runs[i + 1];
    const left = prev ? Math.ceil((prev.end + run.start) / 2) : 0;
    const right = next ? Math.floor((run.end + next.start) / 2) : r.width - 1;
    return crop(r, { left, top: 0, right, bottom: r.height - 1 });
  });
  return { panels, merged };
}
