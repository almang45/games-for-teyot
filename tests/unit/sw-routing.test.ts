import { describe, expect, it } from 'vitest';
import { REAUTH_PATH, isNetworkOnlyNavigation } from '../../src/platform/swRouting';

describe('service worker navigation routing (ARCHITECTURE §8.3)', () => {
  it.each([
    '/cdn-cgi/access/login/rct.amns.my.id',
    '/cdn-cgi/access/authorized?token=abc',
    '/cdn-cgi/access/logout',
    REAUTH_PATH,
    `${REAUTH_PATH}?next=/`,
    `${REAUTH_PATH}/`,
  ])('sends %s to the network', (path) => {
    expect(isNetworkOnlyNavigation(path)).toBe(true);
  });

  it.each(['/', '/?source=pwa', '/?browser=1', '/masukan', '/rooms/masuk', '/cdn-cgi'])(
    'lets the cached shell answer %s',
    (path) => {
      expect(isNetworkOnlyNavigation(path)).toBe(false);
    },
  );
});
