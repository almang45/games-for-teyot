import { expect, test } from '@playwright/test';
import { GAME_URL, expectScene, pressStart } from './helpers';

test('PRD §7.5 an uncaught error in the running game ends on the retry screen', async ({
  page,
  hasTouch,
}) => {
  await page.goto(GAME_URL);
  await expectScene(page, 'Boot');
  await pressStart(page, hasTouch);
  await expectScene(page, 'House');

  // Stands in for a throw inside a scene's create() or an input handler.
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('e2e: injected game failure');
    }, 0);
  });

  await expectScene(page, 'Failure');
  await expect(page.locator('canvas')).toHaveCount(0);
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
