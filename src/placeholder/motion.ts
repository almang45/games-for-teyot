import type { MotionEntry } from '../../contracts/motion.ts';

/**
 * Stand-ins for the `design/motion.json` moments the hub uses, under the same keys, until
 * Antigravity delivers it (AGENTS.md: placeholders unblock logic). Values sit within the brief's caps.
 */
export const placeholderMotion = {
  'house.room-zoom': { kind: 'transition', duration: 600, easing: 'Sine.easeInOut' },
} as const satisfies Record<string, MotionEntry>;
