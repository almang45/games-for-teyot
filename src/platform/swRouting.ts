/**
 * Navigations the service worker must never answer from its cache (ARCHITECTURE §8.3).
 *
 * Cloudflare Access only sees a request that reaches the network. `/cdn-cgi/` carries its login,
 * callback and logout endpoints; if the cached app shell answered them, the auth cookie would never
 * be set. REAUTH_PATH is the parent's way back to the Access login once the session has expired:
 * the cached shell answers "/", so "/" alone can never trigger the redirect.
 */
export const REAUTH_PATH = '/masuk';

// Workbox tests these against pathname + search.
export const NETWORK_ONLY_NAVIGATIONS: readonly RegExp[] = [
  /^\/cdn-cgi\//,
  new RegExp(`^${REAUTH_PATH}(?:[/?#]|$)`),
];

export function isNetworkOnlyNavigation(pathAndSearch: string): boolean {
  return NETWORK_ONLY_NAVIGATIONS.some((pattern) => pattern.test(pathAndSearch));
}
