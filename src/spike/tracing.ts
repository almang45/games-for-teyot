import circle from '../content/glyphs/stroke.circle.json';
import vertical from '../content/glyphs/stroke.vertical.json';
import one from '../content/glyphs/digit.1.json';
import { FOLLOW_DEFAULTS, type FollowParams } from '../engine/tracing/follow';
import { loadGlyph, type Glyph } from '../engine/tracing/glyph';

/** PRD US-TRACE-00: what Papa can tune live on the tablet. */
export interface SpikeSettings extends FollowParams {
  /** A touch wider or taller than this (CSS px) is a palm. */
  readonly palmPx: number;
  readonly showCorridor: boolean;
  /** Draws the raw finger samples, to see latency and smoothing by eye. */
  readonly showTrail: boolean;
}

export const SPIKE_DEFAULTS: SpikeSettings = {
  ...FOLLOW_DEFAULTS,
  palmPx: 90,
  showCorridor: true,
  showTrail: false,
};

export type SliderKey = 'corridor' | 'reach' | 'lookahead' | 'palmPx';

export interface SliderSpec {
  readonly key: SliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Wider than the adaptive range (0.08–0.18 H), so the spike can find where it should sit. */
export const SPIKE_SLIDERS: readonly SliderSpec[] = [
  { key: 'corridor', label: 'Corridor w (H)', min: 0.04, max: 0.3, step: 0.01 },
  { key: 'reach', label: 'Pick-up reach (H)', min: 0.05, max: 0.4, step: 0.01 },
  { key: 'lookahead', label: 'Look-ahead (H)', min: 0.05, max: 0.6, step: 0.01 },
  { key: 'palmPx', label: 'Palm size (px)', min: 20, max: 300, step: 5 },
];

export interface SpikeItem {
  readonly id: string;
  readonly label: string;
  readonly glyph: Glyph;
}

/** The spike's three items, in the order the PRD lists them. */
export const SPIKE_ITEMS: readonly SpikeItem[] = [
  { id: 'vertical', label: 'Vertical', glyph: loadGlyph(vertical) },
  { id: 'circle', label: 'Circle', glyph: loadGlyph(circle) },
  { id: 'one', label: 'Digit 1', glyph: loadGlyph(one) },
];

/** The value a slider writes, clamped to its range and snapped to its step. */
export function sliderValue(spec: SliderSpec, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return spec.min;
  const snapped = Math.round((n - spec.min) / spec.step) * spec.step + spec.min;
  return Number(Math.min(spec.max, Math.max(spec.min, snapped)).toFixed(4));
}
