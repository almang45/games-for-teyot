import { z } from 'zod';

/** Every contract file carries its schema version (WORKFLOW.md §7 bumps it on a breaking change). */
export const CONTRACT_VERSION = 1;

export const version = z.literal(CONTRACT_VERSION);

/** Lets design and asset JSON point editors at the generated JSON Schema (`npm run contracts:schema`). */
export const schemaRef = z.string().optional();

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** File and id names: kebab-case ASCII (ASSETS.md §7). */
export const kebabId = z.string().regex(KEBAB, 'must be kebab-case: a-z, 0-9 and single dashes');

/** Manifest keys: two or more kebab-case segments joined by dots, e.g. `counting.objects.apel`. */
export const ASSET_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
export const assetKey = z.string().regex(ASSET_KEY, 'must be dot-separated kebab-case segments');

const coord = z.number();
const extent = z.number().positive();

/** [x, y] in pixels. */
export const point = z.tuple([coord, coord]);
export type Point = z.infer<typeof point>;

/** [x, y, width, height] in pixels, origin top left. */
export const rect = z.tuple([coord, coord, extent, extent]);
export type Rect = z.infer<typeof rect>;

/** A simple polygon: at least 3 vertices, closed implicitly. */
export const polygon = z.array(point).min(3);
export type Polygon = z.infer<typeof polygon>;

/** [width, height] in pixels. */
export const size = z.tuple([z.number().int().positive(), z.number().int().positive()]);
export type Size = z.infer<typeof size>;

/** `#rrggbb`, lowercase or uppercase. Alpha lives in the token that uses the colour, never here. */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #rrggbb');

/** One finding of a semantic check: errors fail CI, warnings are reported and pass. */
export interface Issue {
  readonly severity: 'error' | 'warning';
  /** JSON path inside the checked document, e.g. `rooms[2].stand`. */
  readonly path: string;
  readonly message: string;
}

export const error = (path: string, message: string): Issue => ({
  severity: 'error',
  path,
  message,
});

export const warning = (path: string, message: string): Issue => ({
  severity: 'warning',
  path,
  message,
});

/** Formats a zod issue path the same way the semantic checks do: `rooms[2].stand`. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === 'number') return `${out}[${part}]`;
    const name = String(part);
    return out === '' ? name : `${out}.${name}`;
  }, '');
}

/** zod parse failures as Issues, so validators report schema and semantic findings alike. */
export function zodIssues(err: z.ZodError): Issue[] {
  return err.issues.map((i) => error(formatPath(i.path), i.message));
}

export const rectContains = (outer: Rect, inner: Rect): boolean =>
  inner[0] >= outer[0] &&
  inner[1] >= outer[1] &&
  inner[0] + inner[2] <= outer[0] + outer[2] &&
  inner[1] + inner[3] <= outer[1] + outer[3];

export const rectContainsPoint = (r: Rect, [x, y]: Point): boolean =>
  x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];

/** Reports every value that appears more than once, once each. */
export function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}
