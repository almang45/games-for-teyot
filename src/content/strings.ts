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

/** Parsed once at module load: a malformed strings file fails loudly at boot, not mid-session. */
export const strings: Strings = StringsSchema.parse(raw);
