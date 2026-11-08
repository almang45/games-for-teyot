import { describe, expect, it } from 'vitest';
import { strings } from '../../src/content/strings';

describe('content/strings.id.json', () => {
  it('parses and has install steps for every platform', () => {
    expect(strings.boot.start).toBe('Mulai');
    for (const steps of Object.values(strings.install.steps)) {
      expect(steps.length).toBeGreaterThan(0);
    }
  });
});
