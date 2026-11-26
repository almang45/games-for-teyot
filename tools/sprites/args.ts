import { resolve, sep } from 'node:path';

/** A manifest animation name (`walk.fr`, `tuck-in.fr`, `talk`) or its base (`walk`). */
const ANIMATION = /^[a-z]+(?:-[a-z]+)*(?:\.(?:fr|br))?$/;
/** A strip file: an animation name plus `.png`. */
const STRIP_FILE = /^([a-z]+(?:-[a-z]+)*(?:\.(?:fr|br))?)\.png$/;

/**
 * `--fps walk=8` pairs as a Map, never a plain object: the names come from the command line, and
 * a name like `__proto__` must stay an ordinary key.
 */
export function parseRates(pairs: readonly string[]): ReadonlyMap<string, number> {
  const rates = new Map<string, number>();
  for (const pair of pairs) {
    const [name = '', value, extra] = pair.split('=');
    const fps = Number(value);
    if (
      extra !== undefined ||
      !ANIMATION.test(name) ||
      !Number.isInteger(fps) ||
      fps < 1 ||
      fps > 30
    ) {
      throw new Error(`--fps takes <animation>=<1–30>, got ${pair}`);
    }
    rates.set(name, fps);
  }
  return rates;
}

/** `path` resolved against `base`, refusing anything that lands outside it. */
export function inside(base: string, path: string): string {
  const root = resolve(base);
  const full = resolve(root, path);
  if (!full.startsWith(root + sep)) throw new Error(`${path} is outside ${root}`);
  return full;
}

/** The animation a strip file holds, or undefined for a file that isn't a strip. */
export function stripName(file: string): string | undefined {
  return STRIP_FILE.exec(file)?.[1];
}
