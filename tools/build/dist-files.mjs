// Shared by the build checks: every file in dist/, with its size, as a '/'-separated relative path.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: handles spaces and Windows drive letters.
export const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

/** dist-relative path with '/' separators on every OS, so prefix checks work on Windows. */
const toPosix = (/** @type {string} */ full) => relative(DIST, full).split(sep).join('/');

/**
 * Symlinks are reported as files, never followed, so a link to reference/ can't hide its contents.
 * @param {string} [dir]
 * @returns {{ path: string, bytes: number }[]}
 */
export function distFiles(dir = DIST) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return distFiles(full);
    return [{ path: toPosix(full), bytes: entry.isSymbolicLink() ? 0 : statSync(full).size }];
  });
}
