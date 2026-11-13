#!/usr/bin/env node
// npm run reference:check: what the parents still need to provide, against ASSETS.md §1.2
// (PRD US-REF-01). Exits 1 while a required item is missing; a missing video is only a warning.
import { printReport } from '../validate/lane.ts';
import { checkReference } from './inventory.ts';

try {
  process.exitCode = printReport(checkReference(process.cwd()));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: 'error', event: 'reference.check.crashed', message }));
  process.exitCode = 1;
}
