type CryptoLike = Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string };

/**
 * Session id for log entries. `randomUUID` only exists in secure contexts, and on-device dev
 * testing runs over plain http on the LAN, so fall back to `getRandomValues` (available everywhere).
 */
export function createSessionId(source: CryptoLike = crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
