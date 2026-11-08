export type LaunchMode = 'game' | 'install';

export type InstallPlatform = 'android' | 'safari-mac' | 'desktop-chromium' | 'other';

export interface LaunchSignals {
  /** Running as an installed app (home screen, Dock, or desktop PWA window). */
  readonly standalone: boolean;
  /** A parent chose "Lanjut di browser" on SCR-INSTALL (`?browser=1`). */
  readonly browserOverride: boolean;
}

export const BROWSER_OVERRIDE_PARAM = 'browser';

/** PRD US-OFF-01: a plain browser tab gets SCR-INSTALL instead of the game. */
export function resolveLaunchMode(signals: LaunchSignals): LaunchMode {
  return signals.standalone || signals.browserOverride ? 'game' : 'install';
}

export function readLaunchSignals(win: Window): LaunchSignals {
  const displayModes = ['fullscreen', 'standalone', 'minimal-ui'];
  const standalone =
    displayModes.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches) ||
    // Safari's legacy flag for Dock / home-screen apps.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const browserOverride =
    new URLSearchParams(win.location.search).get(BROWSER_OVERRIDE_PARAM) === '1';
  return { standalone, browserOverride };
}

export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/Android/i.test(userAgent)) return 'android';
  const chromium = /\b(Chrome|Chromium|CriOS|Edg)\//.test(userAgent);
  if (chromium) return 'desktop-chromium';
  if (userAgent.includes('Macintosh') && userAgent.includes('Safari/')) return 'safari-mac';
  return 'other';
}
