export type LaunchMode = 'game' | 'install';

export type InstallPlatform = 'android' | 'safari-mac' | 'desktop-chromium' | 'other';

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

/** PRD US-OFF-01: a plain browser tab gets SCR-INSTALL instead of the game. */
export function resolveLaunchMode(signals: LaunchSignals): LaunchMode {
  return signals.standalone || signals.browserOverride ? 'game' : 'install';
}

export function readLaunchSignals(win: Window): LaunchSignals {
  const params = new URLSearchParams(win.location.search);
  const matches = (mode: string): boolean => win.matchMedia(`(display-mode: ${mode})`).matches;
  const standalone =
    matches('standalone') ||
    matches('minimal-ui') ||
    // A browser tab in F11/full-screen view also matches "fullscreen"; only trust it together with
    // the installed app's start_url.
    (matches('fullscreen') && params.get(LAUNCH_SOURCE_PARAM) === LAUNCH_SOURCE_INSTALLED) ||
    // Safari's legacy flag for Dock / home-screen apps.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const browserOverride = params.get(BROWSER_OVERRIDE_PARAM) === '1';
  return { standalone, browserOverride };
}

export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/Android/i.test(userAgent)) return 'android';
  const chromium = /\b(Chrome|Chromium|CriOS|Edg)\//.test(userAgent);
  if (chromium) return 'desktop-chromium';
  if (userAgent.includes('Macintosh') && userAgent.includes('Safari/')) return 'safari-mac';
  return 'other';
}
