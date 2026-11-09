import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/**
 * The absolute path of `relative` under `root`, if no part of it is a symlink and it stays inside
 * `root`. Reading through a link (the file or any parent folder) could copy reference/ or
 * recordings/ into the build, which the dist privacy check can't see once it's a plain file.
 * The file must exist.
 */
export function resolveWithoutLinks(root: string, relative: string): string {
  const base = realpathSync(root);
  const target = resolve(base, relative);
  if (!target.startsWith(base + sep)) throw new Error(`${relative} points outside ${root}`);
  if (realpathSync(target) !== target) {
    throw new Error(`${relative} goes through a symlink: copy the file in instead`);
  }
  return target;
}
