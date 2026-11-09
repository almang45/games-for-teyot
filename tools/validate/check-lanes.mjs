#!/usr/bin/env node
// AGENTS.md CI stage "validate (design + assets)": Antigravity's design/ and assets/ must validate
// against contracts/. The real validators land with contracts v1 (tools/validate, ARCHITECTURE §9).
// Until then this fails closed: any design or asset file fails CI, so nothing merges unvalidated.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LANES = ['design', 'assets'];
// Placeholders that keep an empty folder in git are not design work.
const IGNORED = new Set(['.gitkeep', 'README.md']);

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return IGNORED.has(entry.name) ? [] : [relative(ROOT, full)];
  });
}

function main() {
  const found = LANES.filter((lane) => existsSync(join(ROOT, lane))).flatMap((lane) =>
    files(join(ROOT, lane)),
  );
  if (found.length > 0) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'validate.no_validator',
        message: 'design/ and assets/ need the contracts v1 validators before they can merge',
        files: found.slice(0, 20),
        count: found.length,
      }),
    );
    return 1;
  }
  console.log(JSON.stringify({ level: 'info', event: 'validate.ok', lanes: LANES, files: 0 }));
  return 0;
}

process.exitCode = main();
