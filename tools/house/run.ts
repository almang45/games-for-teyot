import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { zodIssues } from '../../contracts/common.ts';
import { checkHouseLayout, houseLayout } from '../../contracts/houseLayout.ts';
import { inFile, parseJsonFile, type FileIssue, type Report } from '../validate/lane.ts';
import { fitToCanvas, gridStep } from './iso.ts';
import { CANVAS, draftLayout } from './layout.ts';
import { checkPlan, floorPlan } from './plan.ts';
import { buildSolids, facesOf } from './scene.ts';
import { blockoutSvg, guideSvg, THEIA_HEIGHT_M } from './svg.ts';

export const OUTPUT_FILES = {
  blockout: 'house-blockout.svg',
  grid: 'house-blockout-grid.svg',
  guide: 'house-blockout-guide.svg',
  layout: 'layout.json',
} as const;

/** A standard door, to compare the house's scale with the sprites'. */
const DOOR_HEIGHT_M = 2.1;

export interface BlockoutSummary {
  /** Canvas px per plan metre; the layout space uses half. */
  readonly pxPerMetre: number;
  /** One grid cell's floor tile on the canvas, [width, height] in px. */
  readonly cellTilePx: readonly [number, number];
  readonly theiaLayoutPx: number;
  readonly doorLayoutPx: number;
  /** Repo-relative paths written. */
  readonly files: readonly string[];
}

export interface BlockoutResult {
  readonly report: Report;
  /** Absent when the plan did not parse or check, so nothing was written. */
  readonly summary?: BlockoutSummary;
}

const LANE = 'house-blockout';

/**
 * Reads the plan at `planArg`, writes the blockout SVGs and the draft layout.json into `outArg`
 * (both resolved against `root`). Layout contract findings are reported, but the files are
 * still written so the guide shows what to fix.
 */
export function runBlockout(root: string, planArg: string, outArg: string): BlockoutResult {
  // Either may be absolute; reports and the summary show them relative to root.
  const planFile = relative(root, resolve(root, planArg));
  const outDir = relative(root, resolve(root, outArg));
  const parsed = parseJsonFile(root, planFile, floorPlan);
  if (!parsed.ok) return { report: { lane: LANE, files: 1, issues: parsed.issues } };
  const plan = parsed.value;
  const planIssues = checkPlan(plan).map(inFile(planFile));
  if (planIssues.length > 0) return { report: { lane: LANE, files: 1, issues: planIssues } };

  const solids = buildSolids(plan);
  const fit = fitToCanvas(
    solids.flatMap((s) => facesOf(s).flatMap((f) => f.points)),
    CANVAS,
    plan.marginPx,
    gridStep(plan.grid),
  );
  const draft = draftLayout(plan, fit, solids);
  const layoutFile = `${outDir}/${OUTPUT_FILES.layout}`;
  const schema = houseLayout.safeParse(draft.layout);
  const layoutIssues: FileIssue[] = [
    ...draft.issues.map(inFile(planFile)),
    ...(schema.success ? checkHouseLayout(schema.data) : zodIssues(schema.error)).map(
      inFile(layoutFile),
    ),
  ];

  const outputs: [string, string][] = [
    [OUTPUT_FILES.blockout, blockoutSvg(solids, fit, CANVAS)],
    [OUTPUT_FILES.grid, blockoutSvg(solids, fit, CANVAS, plan.grid)],
    [
      OUTPUT_FILES.guide,
      guideSvg({
        solids,
        fit,
        grid: plan.grid,
        size: CANVAS,
        layout: draft.layout,
        hidden: draft.hidden,
        stands: draft.stands,
      }),
    ],
    [OUTPUT_FILES.layout, `${JSON.stringify(draft.layout, null, 2)}\n`],
  ];
  mkdirSync(join(root, outDir), { recursive: true });
  for (const [name, content] of outputs) writeFileSync(join(root, outDir, name), content);

  const layoutPxPerMetre = fit.scale / 2;
  // gridStep makes this whole; the rounding only drops float noise.
  const cellPx = Math.round(plan.grid * fit.scale * 1000) / 1000;
  return {
    report: { lane: LANE, files: 1, issues: layoutIssues },
    summary: {
      pxPerMetre: fit.scale,
      cellTilePx: [2 * cellPx, cellPx],
      theiaLayoutPx: Math.round(THEIA_HEIGHT_M * layoutPxPerMetre),
      doorLayoutPx: Math.round(DOOR_HEIGHT_M * layoutPxPerMetre),
      files: outputs.map(([name]) => `${outDir}/${name}`),
    },
  };
}
