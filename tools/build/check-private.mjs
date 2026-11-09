#!/usr/bin/env node
// PRD US-PRIV-01: the build output must contain nothing from reference/ or recordings/, and only
// allow-listed web asset types (tools/build/privacy-rules.mjs).
import { distFiles, DIST } from './dist-files.mjs';
import { violation } from './privacy-rules.mjs';

function main() {
  let files;
  try {
    files = distFiles();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'privacy.dist_unreadable',
        dist: DIST,
        error: String(err),
      }),
    );
    return 1;
  }
  const violations = files.flatMap(({ path }) => {
    const reason = violation(path);
    return reason ? [{ path, reason }] : [];
  });
  if (violations.length > 0) {
    console.error(JSON.stringify({ level: 'error', event: 'privacy.forbidden_files', violations }));
    return 1;
  }
  console.log(JSON.stringify({ level: 'info', event: 'privacy.ok', files: files.length }));
  return 0;
}

process.exitCode = main();
