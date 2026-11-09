import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { getStrings, parseStrings } from '../../src/content/strings';

describe('content/strings.id.json', () => {
  it('parses and has install steps for every platform', () => {
    const strings = getStrings();
    expect(strings.boot.start).toBe('Mulai');
    for (const steps of Object.values(strings.install.steps)) {
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it('parses once and reuses the result', () => {
    expect(getStrings()).toBe(getStrings());
  });

  it('rejects a file with an empty or missing key', () => {
    const broken = structuredClone(getStrings());
    broken.boot.start = '';
    expect(() => parseStrings(broken)).toThrow(ZodError);
    expect(() => parseStrings({})).toThrow(ZodError);
  });
});
