import { describe, expect, it } from 'vitest';
import { createSessionId } from '../../src/log/session';

describe('createSessionId', () => {
  it('uses randomUUID in secure contexts', () => {
    const source = { randomUUID: () => 'uuid-1', getRandomValues: () => new Uint8Array(16) };
    expect(createSessionId(source as unknown as Crypto)).toBe('uuid-1');
  });

  it('falls back to getRandomValues over plain http (no randomUUID)', () => {
    const source = {
      getRandomValues: (a: Uint8Array) => {
        a.fill(0xab);
        return a;
      },
    };
    expect(createSessionId(source as unknown as Crypto)).toBe('ab'.repeat(16));
  });

  it('produces distinct ids with the real crypto', () => {
    expect(createSessionId()).not.toBe(createSessionId());
  });
});
