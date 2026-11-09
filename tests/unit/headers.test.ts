import { describe, expect, it } from 'vitest';
import { parseGlobalHeaders, readGlobalHeaders } from '../../tools/build/headers';

describe('_headers parsing', () => {
  it('returns only the global block', () => {
    const source = [
      '# comment',
      '/*',
      "  Content-Security-Policy: default-src 'self'",
      '  X-Content-Type-Options: nosniff',
      '',
      '/static/*',
      '  Cache-Control: immutable',
    ].join('\n');
    expect(parseGlobalHeaders(source)).toEqual({
      'Content-Security-Policy': "default-src 'self'",
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('rejects a malformed header line', () => {
    expect(() => parseGlobalHeaders('/*\n  NoColonHere')).toThrow(/Malformed/);
  });

  it('keeps the shipped CSP free of third-party origins (US-PRIV-01)', () => {
    const csp = readGlobalHeaders('public/_headers')['Content-Security-Policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain('unsafe-');
  });
});
