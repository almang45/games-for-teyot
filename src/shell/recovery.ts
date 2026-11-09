/** sessionStorage survives the reload, so the reloaded app knows it already tried once. */
export const AUTO_RELOAD_KEY = 'rct.autoReloadAt';

/** A failure that comes back within this window waits for a parent's tap instead of looping. */
export const AUTO_RELOAD_WINDOW_MS = 30_000;

/** PRD §7.5: the recovery screen shows for about 2 s before the app reloads to SCR-BOOT. */
export const AUTO_RELOAD_DELAY_MS = 2_000;

/**
 * Claims the one automatic reload allowed per window. Without storage there is no loop guard, so
 * the screen waits for the retry tap and the error goes to `onStorageError`.
 */
export function claimAutoReload(
  win: Pick<Window, 'sessionStorage'>,
  now: number,
  onStorageError: (err: unknown) => void,
): boolean {
  try {
    const storage = win.sessionStorage;
    const last = Number(storage.getItem(AUTO_RELOAD_KEY));
    const elapsed = now - last;
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < AUTO_RELOAD_WINDOW_MS) return false;
    storage.setItem(AUTO_RELOAD_KEY, String(now));
    return true;
  } catch (err) {
    onStorageError(err);
    return false;
  }
}
