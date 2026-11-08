#!/usr/bin/env node
// PRD US-PRIV-01: the build output must contain nothing from reference/ or recordings/.
// Photos and raw audio never ship; processed voice ships only as Opus .webm sprites.
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../../dist/', import.meta.url).pathname;

const FORBIDDEN_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.heic',
  '.heif',
  '.dng',
  '.raw',
  '.mov',
  '.mp4',
  '.m4v',
  '.avi',
  '.wav',
  '.aif',
  '.aiff',
  '.flac',
  '.m4a',
  '.mp3',
];
const FORBIDDEN_SEGMENTS = ['reference', 'recordings'];

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [relative(DIST, full)];
  });
}

function main() {
  let files;
  try {
    files = walk(DIST);
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', event: 'privacy.dist_unreadable', error: String(err) }),
    );
    return 1;
  }
  const violations = files.filter((path) => {
    const lower = path.toLowerCase();
    const segments = lower.split(/[\\/]/);
    return (
      FORBIDDEN_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
      segments.some((s) => FORBIDDEN_SEGMENTS.includes(s))
    );
  });
  if (violations.length > 0) {
    console.error(JSON.stringify({ level: 'error', event: 'privacy.forbidden_files', violations }));
    return 1;
  }
  console.log(JSON.stringify({ level: 'info', event: 'privacy.ok', files: files.length }));
  return 0;
}

process.exitCode = main();
