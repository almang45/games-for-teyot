import { z } from 'zod';
import { error, schemaRef, version, type Issue } from './common.ts';

const FAMILIES = [
  'Quad',
  'Cubic',
  'Quart',
  'Quint',
  'Sine',
  'Expo',
  'Circ',
  'Elastic',
  'Back',
  'Bounce',
];
const DIRECTIONS = ['easeIn', 'easeOut', 'easeInOut'];

/** Phaser's EaseMap names, so `motion.json` feeds tweens as it is. */
export const EASINGS: readonly [string, ...string[]] = [
  'Linear',
  ...FAMILIES.flatMap((family) => DIRECTIONS.map((dir) => `${family}.${dir}`)),
];

/**
 * How long each kind of movement may take (design brief §1 and §4): calm transitions, short
 * feedback, celebrations ≤ 1.5 s, the 2–3 s bedtime sequence, and gentle loops.
 */
export const MOTION_KINDS = {
  transition: { max: 600 },
  feedback: { max: 600 },
  celebration: { max: 1500 },
  sequence: { max: 3000 },
  ambient: { max: 10000 },
} as const;

export type MotionKind = keyof typeof MOTION_KINDS;

export const motionEntry = z.strictObject({
  kind: z.enum(Object.keys(MOTION_KINDS) as [MotionKind, ...MotionKind[]]),
  /** ms. */
  duration: z.number().int().positive(),
  easing: z.enum(EASINGS),
  /** ms relative to the trigger; negative starts early (Bubu leaves 150 ms before Theia). */
  delay: z.number().int().min(-1000).max(3000).optional(),
});
export type MotionEntry = z.infer<typeof motionEntry>;

/** The key moments of M1 (design brief §4), each with its kind and the brief's own cap. */
export const REQUIRED_MOMENTS = {
  'house.walk-start': { kind: 'transition' },
  'house.walk-stop': { kind: 'transition' },
  'house.bubu-follow': { kind: 'transition' },
  'house.ocica-follow': { kind: 'transition' },
  'house.room-zoom': { kind: 'transition' },
  'trace.snap': { kind: 'feedback', max: 250 },
  'trace.miss-fade': { kind: 'feedback', max: 400 },
  'count.tap-bounce': { kind: 'feedback', max: 120 },
  'count.drop-squash': { kind: 'feedback', max: 150 },
  'count.hop-back': { kind: 'feedback', max: 500 },
  'tidy.mess': { kind: 'sequence', max: 1000 },
  'tidy.toy-in': { kind: 'feedback', max: 300 },
  'tidy.toy-miss': { kind: 'feedback', max: 400 },
  'color.fill': { kind: 'feedback', max: 200 },
  celebrate: { kind: 'celebration' },
  bedtime: { kind: 'sequence', min: 2000, max: 3000 },
} as const satisfies Record<string, { kind: MotionKind; min?: number; max?: number }>;

const MOMENT_KEY = /^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)*$/;

/** `design/motion.json`: one entry per movement (brief §1, "every movement gets an entry"). */
export const motion = z.strictObject({
  $schema: schemaRef,
  version,
  moments: z.record(z.string().regex(MOMENT_KEY, 'must be dot-separated kebab-case'), motionEntry),
});
export type Motion = z.infer<typeof motion>;

export function checkMotion(m: Motion): Issue[] {
  const issues: Issue[] = [];
  for (const [name, entry] of Object.entries(m.moments)) {
    const path = `moments.${name}`;
    const cap = MOTION_KINDS[entry.kind].max;
    if (entry.duration > cap) {
      issues.push(error(`${path}.duration`, `${entry.kind} lasts at most ${cap} ms`));
    }
  }
  for (const [name, rule] of Object.entries(REQUIRED_MOMENTS)) {
    const path = `moments.${name}`;
    const entry = m.moments[name];
    if (!entry) {
      issues.push(error('moments', `missing ${name}`));
      continue;
    }
    if (entry.kind !== rule.kind) issues.push(error(`${path}.kind`, `${name} is a ${rule.kind}`));
    if ('max' in rule && entry.duration > rule.max) {
      issues.push(error(`${path}.duration`, `${name} lasts at most ${rule.max} ms`));
    }
    if ('min' in rule && entry.duration < rule.min) {
      issues.push(error(`${path}.duration`, `${name} lasts at least ${rule.min} ms`));
    }
  }
  return issues;
}
