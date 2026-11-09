import { describe, expect, it } from 'vitest';
import {
  detectInstallPlatform,
  readLaunchSignals,
  resolveLaunchMode,
} from '../../src/platform/launch';

const UA = {
  tabS10:
    'Mozilla/5.0 (Linux; Android 15; SM-X826B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  winEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
};

describe('resolveLaunchMode (US-OFF-01)', () => {
  it('shows SCR-INSTALL in a plain browser tab', () => {
    expect(resolveLaunchMode({ standalone: false, browserOverride: false })).toBe('install');
  });
  it('starts the game when installed', () => {
    expect(resolveLaunchMode({ standalone: true, browserOverride: false })).toBe('game');
  });
  it('starts the game when a parent chose to continue in the browser', () => {
    expect(resolveLaunchMode({ standalone: false, browserOverride: true })).toBe('game');
  });
});

describe('readLaunchSignals', () => {
  const fakeWindow = (matching: string[], search: string, safariStandalone = false): Window =>
    ({
      matchMedia: (q: string) => ({ matches: matching.includes(q) }),
      navigator: { standalone: safariStandalone },
      location: { search },
    }) as unknown as Window;

  it('detects standalone and minimal-ui display modes', () => {
    expect(readLaunchSignals(fakeWindow(['(display-mode: standalone)'], '')).standalone).toBe(true);
    expect(readLaunchSignals(fakeWindow(['(display-mode: minimal-ui)'], '')).standalone).toBe(true);
    expect(readLaunchSignals(fakeWindow([], '')).standalone).toBe(false);
  });
  it('trusts fullscreen only when launched from the installed start_url', () => {
    const fullscreen = ['(display-mode: fullscreen)'];
    expect(readLaunchSignals(fakeWindow(fullscreen, '?source=pwa')).standalone).toBe(true);
    // A browser tab in F11 / full-screen view: no install bypass.
    expect(readLaunchSignals(fakeWindow(fullscreen, '')).standalone).toBe(false);
    // The start_url alone, opened in a normal tab, is not an installed app either.
    expect(readLaunchSignals(fakeWindow([], '?source=pwa')).standalone).toBe(false);
  });
  it('honours Safari navigator.standalone', () => {
    expect(readLaunchSignals(fakeWindow([], '', true)).standalone).toBe(true);
  });
  it('reads the browser override only for browser=1', () => {
    expect(readLaunchSignals(fakeWindow([], '?browser=1')).browserOverride).toBe(true);
    expect(readLaunchSignals(fakeWindow([], '?browser=0')).browserOverride).toBe(false);
  });
});

describe('detectInstallPlatform', () => {
  it.each([
    [UA.tabS10, 'android'],
    [UA.macSafari, 'safari-mac'],
    [UA.macChrome, 'desktop-chromium'],
    [UA.winEdge, 'desktop-chromium'],
    [UA.firefox, 'other'],
  ] as const)('%s → %s', (ua, expected) => {
    expect(detectInstallPlatform(ua)).toBe(expected);
  });
});
