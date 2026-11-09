import { z } from 'zod';
import raw from '../../content/strings.id.json';

const StepsSchema = z.array(z.string().min(1)).min(1);

const StringsSchema = z.object({
  boot: z.object({ start: z.string().min(1) }),
  install: z.object({
    title: z.string().min(1),
    lead: z.string().min(1),
    steps: z.object({
      android: StepsSchema,
      'safari-mac': StepsSchema,
      'desktop-chromium': StepsSchema,
      other: StepsSchema,
    }),
    continueInBrowser: z.string().min(1),
    browserWarning: z.string().min(1),
  }),
});

export type Strings = z.infer<typeof StringsSchema>;

export function parseStrings(input: unknown): Strings {
  return StringsSchema.parse(input);
}

let cached: Strings | undefined;

/**
 * Parsed on first use, not at import, so a malformed file throws after the global error capture is
 * installed and lands in the structured log. main() calls this during boot, so it still fails early.
 */
export function getStrings(): Strings {
  cached ??= parseStrings(raw);
  return cached;
}
