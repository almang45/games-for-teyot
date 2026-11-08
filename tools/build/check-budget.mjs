#!/usr/bin/env node
// Fails the build when dist/ exceeds the budgets in docs/ARCHITECTURE.md §10.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../../dist/', import.meta.url).pathname;
const MB = 1024 * 1024;

// Room bundles (lazy, cached on first entry) live under these prefixes once they exist.
const ROOM_PREFIXES = ['rooms/', 'audio/rooms/'];
const BUDGETS = {
  firstLoadBytes: 3 * MB,
  totalBytes: 60 * MB,
};

/** @param {string} dir @returns {{ path: string, bytes: number }[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [{ path: relative(DIST, full), bytes: statSync(full).size }];
  });
}

function main() {
  let files;
  try {
    files = walk(DIST);
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', event: 'budget.dist_unreadable', error: String(err) }),
    );
    return 1;
  }
  const isRoom = (/** @type {string} */ p) => ROOM_PREFIXES.some((prefix) => p.startsWith(prefix));
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  const firstLoad = files.filter((f) => !isRoom(f.path)).reduce((sum, f) => sum + f.bytes, 0);

  const report = {
    level: 'info',
    event: 'budget.report',
    firstLoadMB: +(firstLoad / MB).toFixed(2),
    totalMB: +(total / MB).toFixed(2),
    largest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 5),
  };
  console.log(JSON.stringify(report));

  const failures = [];
  if (firstLoad > BUDGETS.firstLoadBytes)
    failures.push(`first load ${report.firstLoadMB} MB > 3 MB`);
  if (total > BUDGETS.totalBytes) failures.push(`total ${report.totalMB} MB > 60 MB`);
  if (failures.length > 0) {
    console.error(JSON.stringify({ level: 'error', event: 'budget.exceeded', failures }));
    return 1;
  }
  return 0;
}

process.exitCode = main();
