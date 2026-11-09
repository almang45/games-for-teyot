export type LaunchMode = 'game' | 'install';

export type InstallPlatform = 'android' | 'ios' | 'safari-mac' | 'desktop-chromium' | 'other';

export interface LaunchSignals {
  /** Running as an installed app (home screen, Dock, or desktop PWA window). */
  readonly standalone: boolean;
  /** A parent chose "Lanjut di browser" on SCR-INSTALL (`?browser=1`). */
  readonly browserOverride: boolean;
}

export const BROWSER_OVERRIDE_PARAM = 'browser';

/** The manifest's start_url carries this, so only a launch from the installed app sets it. */
export const LAUNCH_SOURCE_PARAM = 'source';
export const LAUNCH_SOURCE_INSTALLED = 'pwa';
export const INSTALLED_START_URL = `/?${LAUNCH_SOURCE_PARAM}=${LAUNCH_SOURCE_INSTALLED}`;

/** Set on the first launch from the installed start_url; later in-scope launches lack the param. */
export const INSTALLED_FLAG_KEY = 'rct.launchedInstalled';

/** PRD US-OFF-01: a plain browser tab gets SCR-INSTALL instead of the game. */
export function resolveLaunchMode(signals: LaunchSignals): LaunchMode {
  return signals.standalone || signals.browserOverride ? 'game' : 'install';
}

/**
 * Storage failures (private mode, blocked site data) must not block the launch, so they are
 * reported through `onStorageError` and the flag is treated as absent.
 */
export function readLaunchSignals(
  win: Window,
  onStorageError: (err: unknown) => void,
): LaunchSignals {
  const params = new URLSearchParams(win.location.search);
  const matches = (mode: string): boolean => win.matchMedia(`(display-mode: ${mode})`).matches;
  const fromStartUrl = params.get(LAUNCH_SOURCE_PARAM) === LAUNCH_SOURCE_INSTALLED;
  // A browser tab in F11/full-screen view also matches "fullscreen", so fullscreen alone proves
  // nothing. It counts when launched from the start_url, or when an earlier launch from it set the
  // flag (an in-scope link or a reload to "/" opens the installed app without the param). On
  // Android the WebAPK shares storage with Chrome, so an F11-style tab on a device that already has
  // the app installed also gets the game; that is acceptable.
  let fullscreenInstalled = false;
  if (matches('fullscreen')) {
    if (fromStartUrl) {
      writeInstalledFlag(win, onStorageError);
      fullscreenInstalled = true;
    } else {
      fullscreenInstalled = readInstalledFlag(win, onStorageError);
    }
  }
  const standalone =
    matches('standalone') ||
    matches('minimal-ui') ||
    fullscreenInstalled ||
    // Safari's legacy flag for Dock / home-screen apps.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const browserOverride = params.get(BROWSER_OVERRIDE_PARAM) === '1';
  return { standalone, browserOverride };
}

function readInstalledFlag(win: Window, onStorageError: (err: unknown) => void): boolean {
  try {
    return win.localStorage.getItem(INSTALLED_FLAG_KEY) === '1';
  } catch (err) {
    onStorageError(err);
    return false;
  }
}

function writeInstalledFlag(win: Window, onStorageError: (err: unknown) => void): void {
  try {
    win.localStorage.setItem(INSTALLED_FLAG_KEY, '1');
  } catch (err) {
    onStorageError(err);
  }
}

export interface ClientHints {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  /** `navigator.userAgentData.platform` where the browser exposes it (Chromium). */
  readonly uaPlatform?: string | undefined;
}

export function detectInstallPlatform(client: ClientHints): InstallPlatform {
  const { userAgent: ua, maxTouchPoints, uaPlatform } = client;
  const touch = maxTouchPoints > 0;
  if (/Android/i.test(ua) || uaPlatform === 'Android') return 'android';
  // iPadOS Safari reports a Macintosh UA; only the touch points give it away.
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && maxTouchPoints > 1)) return 'ios';
  const chromium = /\b(Chrome|Chromium|Edg)\//.test(ua);
  // Chrome on 10"+ Android tablets (the Tab S10+) requests desktop sites by default and sends an
  // X11 Linux UA. A touch-capable "Linux desktop" Chrome is far more likely to be that tablet.
  if (chromium && touch && ua.includes('X11; Linux')) return 'android';
  if (chromium) return 'desktop-chromium';
  if (ua.includes('Macintosh') && ua.includes('Safari/')) return 'safari-mac';
  return 'other';
}
