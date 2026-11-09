#!/usr/bin/env node
// Fails the build when dist/ exceeds the budgets in docs/ARCHITECTURE.md §10 (tools/build/budget.mjs).
import { evaluateBudget, toMB } from './budget.mjs';
import { distFiles, DIST } from './dist-files.mjs';

function main() {
  let files;
  try {
    files = distFiles();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'budget.dist_unreadable',
        dist: DIST,
        error: String(err),
      }),
    );
    return 1;
  }
  const result = evaluateBudget(files);
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'budget.report',
      firstLoadMB: toMB(result.firstLoadBytes),
      totalMB: toMB(result.totalBytes),
      roomsMB: Object.fromEntries(Object.entries(result.rooms).map(([r, b]) => [r, toMB(b)])),
      largest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 5),
    }),
  );
  if (result.failures.length > 0) {
    console.error(
      JSON.stringify({ level: 'error', event: 'budget.exceeded', failures: result.failures }),
    );
    return 1;
  }
  return 0;
}

process.exitCode = main();
