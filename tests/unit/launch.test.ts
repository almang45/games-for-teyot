import { describe, expect, it } from 'vitest';
import {
  INSTALLED_FLAG_KEY,
  type InstallPlatform,
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
  // Chrome on a 10"+ Android tablet requests the desktop site by default.
  linuxChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1',
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
  class MemoryStorage {
    readonly items = new Map<string, string>();
    getItem(key: string): string | null {
      return this.items.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.items.set(key, value);
    }
  }

  const fakeWindow = (
    matching: string[],
    search: string,
    {
      safariStandalone = false,
      storage = new MemoryStorage(),
    }: { safariStandalone?: boolean; storage?: MemoryStorage | Error } = {},
  ): Window =>
    ({
      matchMedia: (q: string) => ({ matches: matching.includes(q) }),
      navigator: { standalone: safariStandalone },
      location: { search },
      get localStorage() {
        if (storage instanceof Error) throw storage;
        return storage;
      },
    }) as unknown as Window;

  const fullscreen = ['(display-mode: fullscreen)'];
  const noStorageError = (err: unknown): never => {
    throw new Error(`unexpected storage error: ${String(err)}`);
  };
  const read = (win: Window, platform: InstallPlatform = 'desktop-chromium') =>
    readLaunchSignals(win, platform, noStorageError);

  it('detects standalone and minimal-ui display modes', () => {
    expect(read(fakeWindow(['(display-mode: standalone)'], '')).standalone).toBe(true);
    expect(read(fakeWindow(['(display-mode: minimal-ui)'], '')).standalone).toBe(true);
    expect(read(fakeWindow([], '')).standalone).toBe(false);
  });

  it('trusts fullscreen only when launched from the installed start_url', () => {
    expect(read(fakeWindow(fullscreen, '?source=pwa')).standalone).toBe(true);
    // A browser tab in F11 / full-screen view: no install bypass.
    expect(read(fakeWindow(fullscreen, '')).standalone).toBe(false);
    // The start_url alone, opened in a normal tab, is not an installed app either.
    expect(read(fakeWindow([], '?source=pwa')).standalone).toBe(false);
  });

  it('remembers an installed launch, so in-scope links and reloads to "/" stay in the game', () => {
    const storage = new MemoryStorage();
    expect(read(fakeWindow(fullscreen, '?source=pwa', { storage })).standalone).toBe(true);
    expect(storage.getItem(INSTALLED_FLAG_KEY)).toBe('1');
    expect(read(fakeWindow(fullscreen, '', { storage })).standalone).toBe(true);
    // The flag never turns a normal tab into the app.
    expect(read(fakeWindow([], '', { storage })).standalone).toBe(false);
  });

  it('reports unavailable storage and still decides from the other signals', () => {
    const errors: unknown[] = [];
    const storage = new Error('SecurityError');
    const onError = (err: unknown): void => {
      errors.push(err);
    };
    const launched = readLaunchSignals(
      fakeWindow(fullscreen, '?source=pwa', { storage }),
      'desktop-chromium',
      onError,
    );
    expect(launched.standalone).toBe(true);
    const relaunched = readLaunchSignals(
      fakeWindow(fullscreen, '', { storage }),
      'desktop-chromium',
      onError,
    );
    expect(relaunched.standalone).toBe(false);
    expect(errors).toEqual([storage, storage]);
  });

  it('on Android, trusts fullscreen without the start_url or the flag', () => {
    const storage = new MemoryStorage();
    // First launch of the installed app from a captured link, or after site data was cleared.
    expect(read(fakeWindow(fullscreen, '', { storage }), 'android').standalone).toBe(true);
    expect(read(fakeWindow([], '', { storage }), 'android').standalone).toBe(false);
    // Storage is not even read: a blocked store cannot send the installed app to SCR-INSTALL.
    const blocked = new Error('SecurityError');
    expect(read(fakeWindow(fullscreen, '', { storage: blocked }), 'android').standalone).toBe(true);
  });

  it('honours Safari navigator.standalone', () => {
    expect(read(fakeWindow([], '', { safariStandalone: true })).standalone).toBe(true);
  });

  it('reads the browser override only for browser=1', () => {
    expect(read(fakeWindow([], '?browser=1')).browserOverride).toBe(true);
    expect(read(fakeWindow([], '?browser=0')).browserOverride).toBe(false);
  });
});

describe('detectInstallPlatform', () => {
  it.each([
    ['Tab S10+ mobile UA', { userAgent: UA.tabS10, maxTouchPoints: 10 }, 'android'],
    ['Tab S10+ desktop-site UA', { userAgent: UA.linuxChrome, maxTouchPoints: 10 }, 'android'],
    [
      'Android UA-CH platform',
      { userAgent: UA.linuxChrome, maxTouchPoints: 0, uaPlatform: 'Android' },
      'android',
    ],
    [
      'Linux desktop without touch',
      { userAgent: UA.linuxChrome, maxTouchPoints: 0 },
      'desktop-chromium',
    ],
    ['iPhone Safari', { userAgent: UA.iphone, maxTouchPoints: 5 }, 'ios'],
    ['iPhone Chrome', { userAgent: UA.iphoneChrome, maxTouchPoints: 5 }, 'ios'],
    ['iPad (Mac UA + touch)', { userAgent: UA.macSafari, maxTouchPoints: 5 }, 'ios'],
    ['Mac Safari', { userAgent: UA.macSafari, maxTouchPoints: 0 }, 'safari-mac'],
    ['Mac Chrome', { userAgent: UA.macChrome, maxTouchPoints: 0 }, 'desktop-chromium'],
    ['Windows Edge with touch', { userAgent: UA.winEdge, maxTouchPoints: 10 }, 'desktop-chromium'],
    ['Firefox', { userAgent: UA.firefox, maxTouchPoints: 0 }, 'other'],
  ] as const)('%s', (_name, client, expected) => {
    expect(detectInstallPlatform(client)).toBe(expected);
  });
});
