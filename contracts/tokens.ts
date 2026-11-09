import { z } from 'zod';
import { assetKey, error, hexColor, kebabId, schemaRef, version, type Issue } from './common.ts';

const px = z.number().min(0).max(2048);

const scale = z.record(kebabId, px);

/** `design/tokens.json` (WORKFLOW.md §3). Becomes CSS variables and TS constants at build time. */
export const tokens = z.strictObject({
  $schema: schemaRef,
  version,
  color: z.strictObject({
    /** The art palette, shared with `assets/` (ASSETS.md §2). */
    palette: z.record(kebabId, hexColor).refine((p) => Object.keys(p).length <= 24, {
      message: 'at most 24 palette colours',
    }),
    /** The coloring swatches, in the order they appear in the palette bar. */
    swatches: z.array(hexColor).length(10),
    semantic: z.strictObject({
      interactive: hexColor,
      success: hexColor,
      hint: hexColor,
      locked: hexColor,
    }),
    /** Tracing colours; the surface base is the art's average tone, for the contrast check. */
    tracing: z.strictObject({
      surface: hexColor,
      guide: hexColor,
      dots: hexColor,
      ink: hexColor,
      hint: hexColor,
    }),
    /** The day/night blend (design brief §3, SCR-HOUSE): a tint and its strength per sky look. */
    sky: z.strictObject({
      morning: z.strictObject({ tint: hexColor, strength: z.number().min(0).max(1) }),
      noon: z.strictObject({ tint: hexColor, strength: z.number().min(0).max(1) }),
      afternoon: z.strictObject({ tint: hexColor, strength: z.number().min(0).max(1) }),
      dusk: z.strictObject({ tint: hexColor, strength: z.number().min(0).max(1) }),
    }),
    /** The parent area: plain adult UI, readable text. */
    parent: z.strictObject({
      surface: hexColor,
      text: hexColor,
      accent: hexColor,
      'accent-text': hexColor,
    }),
  }),
  font: z.strictObject({
    /** Bundled fonts only (no remote fonts): manifest keys of `font.*` entries. */
    family: z.strictObject({ body: assetKey, display: assetKey }),
    size: scale,
    weight: z.record(kebabId, z.number().int().min(100).max(900).multipleOf(100)),
  }),
  space: scale,
  radius: scale,
  /** Shadows as CSS-like parts; colour comes from the palette or semantic keys. */
  shadow: z.record(
    kebabId,
    z.strictObject({
      x: z.number(),
      y: z.number(),
      blur: px,
      spread: z.number(),
      color: hexColor,
      opacity: z.number().min(0).max(1),
    }),
  ),
  /** Stacking order for DOM overlays above the canvas. */
  z: z.record(kebabId, z.number().int().min(0).max(10000)),
});
export type Tokens = z.infer<typeof tokens>;

/** WCAG 2.x relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Minimum contrasts. Ink and the dotted guide must read clearly on the surface; the wide guide
 * band is deliberately soft, but her ink must still stand out on it. Parent text follows WCAG AA.
 */
type Colors = Tokens['color'];

interface ContrastRule {
  readonly fg: string;
  readonly bg: string;
  readonly min: number;
  readonly pick: (c: Colors) => readonly [string, string];
}

export const CONTRAST_RULES: readonly ContrastRule[] = [
  {
    fg: 'tracing.ink',
    bg: 'tracing.surface',
    min: 3,
    pick: (c) => [c.tracing.ink, c.tracing.surface],
  },
  {
    fg: 'tracing.dots',
    bg: 'tracing.surface',
    min: 3,
    pick: (c) => [c.tracing.dots, c.tracing.surface],
  },
  {
    fg: 'tracing.guide',
    bg: 'tracing.surface',
    min: 1.5,
    pick: (c) => [c.tracing.guide, c.tracing.surface],
  },
  { fg: 'tracing.ink', bg: 'tracing.guide', min: 2, pick: (c) => [c.tracing.ink, c.tracing.guide] },
  {
    fg: 'parent.text',
    bg: 'parent.surface',
    min: 4.5,
    pick: (c) => [c.parent.text, c.parent.surface],
  },
  {
    fg: 'parent.accent-text',
    bg: 'parent.accent',
    min: 4.5,
    pick: (c) => [c.parent['accent-text'], c.parent.accent],
  },
];

/** Rules the schema can't express. Font keys are checked against the manifest by validate:design. */
export function checkTokens(t: Tokens): Issue[] {
  const issues: Issue[] = [];
  for (const rule of CONTRAST_RULES) {
    const ratio = contrastRatio(...rule.pick(t.color));
    if (ratio < rule.min) {
      issues.push(
        error(
          `color.${rule.fg}`,
          `contrast against color.${rule.bg} is ${ratio.toFixed(2)}:1, needs ${rule.min}:1`,
        ),
      );
    }
  }
  const swatches = t.color.swatches.map((s) => s.toLowerCase());
  if (new Set(swatches).size !== swatches.length) {
    issues.push(error('color.swatches', 'swatches must be 10 different colours'));
  }
  return issues;
}
