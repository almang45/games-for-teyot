import { parseStroke, type Polyline } from './path';

/** Vertical metrics a glyph is drawn against (ARCHITECTURE.md §4.1). */
export const GLYPH_METRICS = [
  'cap',
  'xheight',
  'ascender',
  'descender',
  'digit',
  'stroke',
] as const;
export type GlyphMetrics = (typeof GLYPH_METRICS)[number];

/** The shape of `src/content/glyphs/*.json`; JSON imports type `metrics` as a plain string. */
export interface GlyphSource {
  readonly id: string;
  readonly metrics: string;
  readonly strokes: readonly { readonly path: string }[];
  readonly audio?: { readonly name: string; readonly sound?: string };
}

export interface Glyph {
  readonly id: string;
  readonly metrics: GlyphMetrics;
  /** In writing order; each one is drawn in its own direction. */
  readonly strokes: readonly Polyline[];
}

/** The unit box plus this much, so a round stroke may touch its edge. */
const BOX_SLACK = 1e-6;

/** Flattens a hand-authored glyph and checks it, naming the glyph and stroke in any error. */
export function loadGlyph(source: GlyphSource): Glyph {
  const { id } = source;
  if (!id) throw new Error('a glyph needs an id');
  const metrics = GLYPH_METRICS.find((m) => m === source.metrics);
  if (!metrics) throw new Error(`glyph ${id}: unknown metrics "${source.metrics}"`);
  if (source.strokes.length === 0) throw new Error(`glyph ${id}: no strokes`);
  const strokes = source.strokes.map((stroke, i): Polyline => {
    const where = `glyph ${id} stroke ${i + 1}`;
    let line: Polyline;
    try {
      line = parseStroke(stroke.path);
    } catch (err) {
      throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
    const outside = line.points.find((p) => !inBox(p.x) || !inBox(p.y));
    if (outside) throw new Error(`${where}: (${outside.x}, ${outside.y}) is outside the unit box`);
    return line;
  });
  return { id, metrics, strokes };
}

function inBox(v: number): boolean {
  return v >= -BOX_SLACK && v <= 1 + BOX_SLACK;
}
