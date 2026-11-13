#!/usr/bin/env node
// npm run reference:frames [-- [--count N] [--force]]: key frames from every video under
// reference/ into reference/frames/ (PRD US-REF-01). Videos whose frames are current are skipped.
import { parseArgs } from 'node:util';
import { extractFrames } from './keyframes.ts';

try {
  const { values } = parseArgs({
    options: {
      count: { type: 'string', default: '12' },
      force: { type: 'boolean', default: false },
    },
  });
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > 60) {
    throw new Error(`--count must be a whole number from 1 to 60, got ${values.count}`);
  }
  const results = extractFrames(process.cwd(), { count, force: values.force });
  for (const r of results) {
    const failed = r.status === 'failed';
    const line = JSON.stringify({
      level: failed ? 'error' : 'info',
      event: `reference.frames.${r.status}`,
      ...r,
    });
    if (failed) console.error(line);
    else console.log(line);
  }
  const failed = results.filter((r) => r.status === 'failed').length;
  const summary = {
    level: failed > 0 ? 'error' : 'info',
    event: 'reference.frames.done',
    videos: results.length,
    written: results.filter((r) => r.status === 'written').length,
    failed,
  };
  console.log(JSON.stringify(summary));
  process.exitCode = failed > 0 ? 1 : 0;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: 'error', event: 'reference.frames.crashed', message }));
  process.exitCode = 1;
}
