#!/usr/bin/env node
// npm run house:blockout [plan.json] [out-dir]: the floor plan as an isometric SVG blockout plus a
// draft layout.json (PRD US-REF-02). Both default into reference/, which is never committed.
import { printReport } from '../validate/lane.ts';
import { runBlockout } from './run.ts';

const [plan = 'reference/rumah/denah/floorplan.json', out = 'reference/rumah/blockout'] =
  process.argv.slice(2);

try {
  const { report, summary } = runBlockout(process.cwd(), plan, out);
  if (summary)
    console.log(JSON.stringify({ level: 'info', event: 'house.blockout.written', ...summary }));
  process.exitCode = printReport(report);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: 'error', event: 'house.blockout.crashed', message }));
  process.exitCode = 1;
}
