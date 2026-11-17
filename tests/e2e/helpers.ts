import { expect, type ConsoleMessage, type Page } from '@playwright/test';

/** SCR-INSTALL is skipped the same way a parent does it: "Lanjut di browser". */
export const GAME_URL = '/?browser=1';

export interface LoggedEvent {
  readonly event: string;
  readonly level: string;
  readonly scene: string | null;
  readonly data: Record<string, unknown>;
}

/** Collects the app's structured JSON log lines from the browser console. */
export function collectLog(page: Page): LoggedEvent[] {
  const events: LoggedEvent[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    try {
      const parsed = JSON.parse(msg.text()) as Partial<LoggedEvent>;
      if (typeof parsed.event === 'string') events.push(parsed as LoggedEvent);
    } catch {
      // Not one of ours (e.g. a browser warning); only structured lines are collected.
    }
  });
  return events;
}

export async function expectScene(page: Page, scene: string): Promise<void> {
  await expect(page.locator('body')).toHaveAttribute('data-scene', scene, { timeout: 15_000 });
}

/**
 * Headless Chromium creates every AudioContext 'running' (no flag changes that), so an unlock test
 * would pass even if the tap never resumed anything. This applies the device policy in the page: a
 * context stays 'suspended' until resume() is called with transient user activation, i.e. from
 * inside a real tap or click handler.
 */
export async function emulateAutoplayPolicy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      #unlocked = false;

      override get state(): AudioContextState {
        return this.#unlocked ? super.state : 'suspended';
      }

      override resume(): Promise<void> {
        if (!navigator.userActivation.isActive && !this.#unlocked) {
          return Promise.reject(
            new DOMException('resume() without a user gesture', 'NotAllowedError'),
          );
        }
        this.#unlocked = true;
        return super.resume();
      }
    };
  });
}

/** The "Mulai" button sits over the canvas center, so a center tap/click hits it on every viewport. */
export async function pressStart(page: Page, touch: boolean): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Game canvas has no layout box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
}

/**
 * Taps (touch) or clicks (mouse) a room's stand. HouseScene logs every stand in game pixels on
 * each `house.layout`, so this works on any viewport and after a resize.
 */
export async function tapRoom(
  page: Page,
  touch: boolean,
  log: readonly LoggedEvent[],
  room: string,
): Promise<void> {
  await expect.poll(() => log.some((e) => e.event === 'house.layout')).toBe(true);
  const latest = log.filter((e) => e.event === 'house.layout').at(-1)?.data as
    { width: number; height: number; stands: Record<string, [number, number]> } | undefined;
  const stand = latest?.stands[room];
  if (!latest || !stand) throw new Error(`house.layout logged no stand for ${room}`);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Game canvas has no layout box');
  const x = box.x + (stand[0] * box.width) / latest.width;
  const y = box.y + (stand[1] * box.height) / latest.height;
  if (touch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
}
