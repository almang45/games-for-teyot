import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import raw from '../../content/strings.id.json';
import { strings } from '../../src/content/strings';

const Text = z.string().trim().min(1);
const Steps = z.array(Text).min(1);

// Strict: a misspelt key would otherwise sit unused while the screen shows the old copy.
const StringsSchema = z.strictObject({
  boot: z.strictObject({ start: Text }),
  install: z.strictObject({
    title: Text,
    lead: Text,
    steps: z.strictObject({
      android: Steps,
      ios: Steps,
      'safari-mac': Steps,
      'desktop-chromium': Steps,
      other: Steps,
    }),
    continueInBrowser: Text,
    browserWarning: Text,
  }),
});

describe('content/strings.id.json', () => {
  it('has every key, with non-empty copy and install steps for every platform', () => {
    expect(() => StringsSchema.parse(raw)).not.toThrow();
    expect(strings.boot.start).toBe('Mulai');
  });

  it('the schema rejects empty, missing, and unknown keys', () => {
    const broken = structuredClone(raw);
    broken.boot.start = ' ';
    expect(StringsSchema.safeParse(broken).success).toBe(false);
    expect(StringsSchema.safeParse({}).success).toBe(false);
    expect(StringsSchema.safeParse({ ...raw, extra: 'x' }).success).toBe(false);
  });
});
