import { expect, test } from '@playwright/test';
import { AUTO_RELOAD_DELAY_MS, AUTO_RELOAD_KEY } from '../../src/shell/recovery';
import { GAME_URL, collectLog, expectScene, pressStart } from './helpers';

test('PRD §7.5 an error inside the game loop tears the game down and reloads to SCR-BOOT', async ({
  page,
  hasTouch,
}) => {
  const log = collectLog(page);
  await page.goto(GAME_URL);
  await expectScene(page, 'Boot');
  await pressStart(page, hasTouch);
  await expectScene(page, 'House');

  // Phaser schedules its next frame at the end of the current one. Throwing from that call puts
  // the error inside Phaser's frame and stops the loop, like a throw in a scene's create() or a
  // tween callback: no later frame comes along to run a deferred teardown.
  await page.evaluate(() => {
    const native = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => {
      window.requestAnimationFrame = native;
      throw new Error('e2e: injected game-loop failure');
    };
  });

  await expectScene(page, 'Failure');
  await expect(page.locator('canvas')).toHaveCount(0);
  // The game is really gone (WebGL, AudioContext, window input listeners), not just hidden.
  await expect.poll(() => log.some((e) => e.event === 'game.destroyed')).toBe(true);
  expect(log.find((e) => e.event === 'app.recovering')?.data).toEqual({ autoReload: true });
  // No tap needed: the app reloads to SCR-BOOT on its own.
  await expectScene(page, 'Boot');
});

test('PRD §7.5 a failure that survives the reload waits on the retry button', async ({ page }) => {
  const log = collectLog(page);
  await page.goto(GAME_URL);
  await expectScene(page, 'Boot');
  await page.evaluate((key) => {
    sessionStorage.setItem(key, String(Date.now()));
  }, AUTO_RELOAD_KEY);

  // An unhandled rejection is as fatal as a throw: SCR-BOOT's start runs in a promise chain.
  await page.evaluate(() => {
    void Promise.reject(new Error('e2e: injected async failure'));
  });

  await expectScene(page, 'Failure');
  expect(log.find((e) => e.event === 'app.recovering')?.data).toEqual({ autoReload: false });
  await page.waitForTimeout(AUTO_RELOAD_DELAY_MS + 500);
  await expectScene(page, 'Failure');
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expectScene(page, 'Boot');
});

test.describe('US-DEP-01: Cloudflare Access keeps working with the offline shell', () => {
  test('US-DEP-01 Access endpoints and the re-auth path bypass the cached shell', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Response.fromServiceWorker() is Chromium-only');
    await page.goto(GAME_URL);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    // Control: any other in-scope navigation is answered by the cached shell.
    const shell = await page.goto('/some/deep/link');
    expect(shell?.fromServiceWorker()).toBe(true);

    for (const path of ['/cdn-cgi/access/authorized?token=x', '/masuk']) {
      const response = await page.goto(path);
      expect(response?.fromServiceWorker(), path).toBe(false);
    }
  });
});
