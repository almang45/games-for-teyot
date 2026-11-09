import { lstatSync, realpathSync } from 'node:fs';
import { join, relative as relativeTo, resolve, sep } from 'node:path';

/**
 * The absolute path of `relative` (lane folder included, e.g. `assets/ui/home.png`) under the
 * repo `root`, if no part of it is a symlink and it stays inside `root`. Reading through a link
 * (the file, a folder, or the lane folder itself) could copy reference/ or recordings/ into the
 * build, which the dist privacy check can't see once it's a plain file. Only `root` is resolved
 * first, since a checkout may sit under a linked folder (macOS /tmp). Each part is checked with
 * lstat, so a dangling link is refused as a link too. The file must exist.
 */
export function resolveWithoutLinks(root: string, relative: string): string {
  const base = realpathSync(root);
  const target = resolve(base, relative);
  if (!target.startsWith(base + sep)) throw new Error(`${relative} points outside ${root}`);
  let at = base;
  for (const part of relativeTo(base, target).split(sep)) {
    at = join(at, part);
    if (lstatSync(at).isSymbolicLink()) {
      throw new Error(`${relative} goes through a symlink: copy the file in instead`);
    }
  }
  return target;
}
