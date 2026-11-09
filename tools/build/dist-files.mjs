// Shared by the build checks: every file in dist/, with its size, as a '/'-separated relative path.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: handles spaces and Windows drive letters.
export const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

/**
 * Root-relative path with '/' separators on every OS, so prefix checks work on Windows.
 * @param {string} root @param {string} full
 */
const toPosix = (root, full) => relative(root, full).split(sep).join('/');

/**
 * Symlinks are listed, never followed, and flagged: the privacy check rejects them outright, since
 * wrangler and Workbox would read through a link into reference/ or recordings/.
 * @param {string} [dir]
 * @param {string} [root] what paths are made relative to
 * @returns {{ path: string, bytes: number, symlink: boolean }[]}
 */
export function distFiles(dir = DIST, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return distFiles(full, root);
    const symlink = entry.isSymbolicLink();
    return [{ path: toPosix(root, full), bytes: symlink ? 0 : statSync(full).size, symlink }];
  });
}
