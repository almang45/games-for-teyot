import type { Level } from '../engine/tracing/curriculum';
import type { GlyphSource } from '../engine/tracing/glyph';
import circle from './glyphs/stroke.circle.json';
import cross from './glyphs/stroke.cross.json';
import diagonal from './glyphs/stroke.diagonal.json';
import horizontal from './glyphs/stroke.horizontal.json';
import vertical from './glyphs/stroke.vertical.json';
import wave from './glyphs/stroke.wave.json';
import zigzag from './glyphs/stroke.zigzag.json';
import d0 from './glyphs/digit.0.json';
import d1 from './glyphs/digit.1.json';
import d2 from './glyphs/digit.2.json';
import d3 from './glyphs/digit.3.json';
import d4 from './glyphs/digit.4.json';
import d5 from './glyphs/digit.5.json';
import d6 from './glyphs/digit.6.json';
import d7 from './glyphs/digit.7.json';
import d8 from './glyphs/digit.8.json';
import d9 from './glyphs/digit.9.json';

export interface LevelContent {
  readonly level: Level;
  /** In the order new items are offered (PRD US-TRACE-04). */
  readonly glyphs: readonly GlyphSource[];
}

/** M1 ships T0 and T1 (PLAN.md). */
export const TRACING: readonly LevelContent[] = [
  { level: 'T0', glyphs: [vertical, horizontal, circle, diagonal, cross, zigzag, wave] },
  { level: 'T1', glyphs: [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9] },
];
