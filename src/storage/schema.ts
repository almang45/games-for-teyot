import { z } from 'zod';

/** Bumped when the stored or exported shape changes; transfer.ts upgrades older files. */
export const SCHEMA_VERSION = 1;

/** Stroke attempts kept per item: enough for the parent's replays and new scorer fixtures. */
export const ATTEMPTS_PER_ITEM = 20;

/** A learnable item: `stroke.circle`, `digit.4`, `upper.A`, `count.5` (ARCHITECTURE.md §5). */
export const itemId = z
  .string()
  .regex(/^[a-z]+\.[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'not an item id');

/**
 * Points kept per stroke attempt: enough to replay it for the parent and to make a scorer fixture,
 * and small enough that a full export stays far below MAX_IMPORT_BYTES (transfer.ts).
 */
export const MAX_ATTEMPT_POINTS = 128;
/** Glyph units to 1/1000 of the glyph box: far finer than a finger. */
const POINT_DECIMALS = 1000;

const sessionNumber = z.number().int().min(0);
const count = z.number().int().min(0);

// Records are plain objects, not strict ones: after a rollback (ARCHITECTURE.md §8.4) an older
// build reads what a newer one wrote, and must ignore the fields it doesn't know.

/** ARCHITECTURE.md §12: an item's Leitner record (scheduler/leitner.ts ItemRecord) plus its id. */
export const itemProgress = z
  .object({
    id: itemId,
    box: z.literal([1, 2, 3, 4, 5]),
    waitFromSession: sessionNumber,
    lastSeenSession: sessionNumber,
    attempts: count,
    successes: count,
    sessionMisses: count,
  })
  .refine((p) => p.successes <= p.attempts, 'more successes than attempts')
  .refine((p) => p.waitFromSession <= p.lastSeenSession, 'its wait starts after its last session');
export type ItemProgress = z.infer<typeof itemProgress>;

export const strokeAttempt = z.object({
  itemId,
  strokeIndex: count,
  /** Glyph units, and milliseconds since the stroke began; compactAttempt() fits them. */
  points: z.array(z.tuple([z.number(), z.number(), z.number()])).max(MAX_ATTEMPT_POINTS),
  verdict: z.enum(['pass', 'fail']),
  /** Mouse attempts are practice: they never change an item's box (US-LAPTOP-02). */
  input: z.enum(['touch', 'mouse']),
  corridor: z.number().positive(),
  ts: z.iso.datetime(),
});
export type StrokeAttempt = z.infer<typeof strokeAttempt>;

/**
 * An attempt as stored: at most MAX_ATTEMPT_POINTS points, evenly spread over the stroke with its
 * first and last kept, x and y to 1/1000 of a glyph unit and t to the millisecond. A 240 Hz pen
 * would otherwise make an export of tens of MB.
 */
export function compactAttempt(attempt: StrokeAttempt): StrokeAttempt {
  const { points } = attempt;
  const kept =
    points.length <= MAX_ATTEMPT_POINTS
      ? points
      : Array.from(
          { length: MAX_ATTEMPT_POINTS },
          (_, i) => points[Math.round((i * (points.length - 1)) / (MAX_ATTEMPT_POINTS - 1))],
        ).filter((p) => p !== undefined);
  const round = (v: number): number => Math.round(v * POINT_DECIMALS) / POINT_DECIMALS;
  return { ...attempt, points: kept.map(([x, y, t]) => [round(x), round(y), Math.round(t)]) };
}

/** PRD US-PARENT-03, US-SESSION-01/02. Every field has a default, so a partial record loads. */
export const settings = z.object({
  childName: z.string().trim().min(1).max(40).default('Theia'),
  sessionMinutes: z.number().int().min(5).max(20).default(10),
  narrator: z.enum(['papa', 'mama', 'alternate']).default('mama'),
  caseOrder: z.enum(['lower-first', 'upper-first']).default('lower-first'),
  corridorOverride: z.number().positive().optional(),
  /** Off: "Mulai" is available straight after the bedtime ending (holidays, long car rides). */
  bedtimeCooldown: z.boolean().default(true),
  /** A parent opened T1 before the 80% rule did. */
  digitsUnlocked: z.boolean().default(false),
});
export type Settings = z.infer<typeof settings>;
export const DEFAULT_SETTINGS: Settings = settings.parse({});

/** ARCHITECTURE.md §12: what export writes and import reads. */
export const progressExport = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    exportedAt: z.iso.datetime(),
    /** The last session started, so the scheduler's waits carry over to the new device. */
    session: sessionNumber,
    settings,
    items: z.array(itemProgress),
    attempts: z.array(strokeAttempt),
  })
  .superRefine((e, ctx) => {
    const seen = new Set<string>();
    e.items.forEach((item, i) => {
      if (seen.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `${item.id} twice` });
      }
      seen.add(item.id);
      if (item.lastSeenSession > e.session) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'lastSeenSession'],
          message: `seen in session ${item.lastSeenSession}, after the last session ${e.session}`,
        });
      }
    });
  });
export type ProgressExport = z.infer<typeof progressExport>;
