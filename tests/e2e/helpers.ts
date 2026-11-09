import { expect, type ConsoleMessage, type Page } from '@playwright/test';

/** SCR-INSTALL is skipped the same way a parent does it: "Lanjut di browser". */
export const GAME_URL = '/?browser=1';

export interface LoggedEvent {
  readonly event: string;
  readonly level: string;
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

/** Design-frame height; Scale.EXPAND keeps it on every 16:10-or-wider test viewport. */
const DESIGN_HEIGHT = 1200;

/** Taps (touch) or clicks (mouse) at an offset from the canvas center, in design-frame pixels. */
export async function tapCanvas(page: Page, touch: boolean, offsetY = 0): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Game canvas has no layout box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 + offsetY * (box.height / DESIGN_HEIGHT);
  if (touch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
}

/** The "Mulai" button sits over the canvas center, so a center tap/click hits it on every viewport. */
export async function pressStart(page: Page, touch: boolean): Promise<void> {
  await tapCanvas(page, touch);
}
