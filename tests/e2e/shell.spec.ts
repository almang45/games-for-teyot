import { expect, test } from '@playwright/test';
import {
  FRONT_ROOM_OFFSET,
  GAME_URL,
  emulateAutoplayPolicy,
  collectLog,
  expectScene,
  pressStart,
  tapCanvas,
  type LoggedEvent,
} from './helpers';

test.describe('US-OFF-01: install and offline play', () => {
  test('US-OFF-01 a plain browser tab shows SCR-INSTALL', async ({ page }) => {
    await page.goto('/');
    await expectScene(page, 'Install');
    await expect(page.getByRole('heading', { name: 'Pasang Rumah Cici Theia' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('US-OFF-01 "Lanjut di browser" opens SCR-BOOT', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Lanjut di browser' }).click();
    await expectScene(page, 'Boot');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('US-OFF-01 after one online visit, the app boots and plays offline', async ({
    page,
    context,
    browserName,
    hasTouch,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Service worker offline emulation is Chromium-only in Playwright',
    );
    const log = collectLog(page);
    await page.goto(GAME_URL);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    const started = Date.now();
    await page.reload();
    await expectScene(page, 'Boot');
    expect(Date.now() - started).toBeLessThan(3_000);

    // "The placeholder house is playable" offline: start, reach the house, walk to a room.
    await pressStart(page, hasTouch);
    await expectScene(page, 'House');
    await tapCanvas(page, hasTouch, FRONT_ROOM_OFFSET);
    await expect
      .poll(() => log.find((e) => e.event === 'house.room_tap')?.data.room)
      .toBe('ruang-tamu');
    expect(log.filter((e) => e.level === 'error')).toEqual([]);
  });
});

test.describe('US-AUD-01: audio starts on the first tap', () => {
  test('US-AUD-01 tapping Mulai unlocks audio within 300 ms and opens the house', async ({
    page,
    hasTouch,
    browserName,
  }) => {
    const log = collectLog(page);
    await emulateAutoplayPolicy(page);
    await page.goto(GAME_URL);
    await expectScene(page, 'Boot');
    expect(log.some((e) => e.event === 'boot.audio_unlocked')).toBe(false);
    // Proves the tap does the unlocking: before it, the context must still be locked.
    const bootReady = (): LoggedEvent | undefined =>
      log.find((e) => e.event === 'scene.ready' && e.scene === 'Boot');
    await expect.poll(bootReady, { message: 'SCR-BOOT logged scene.ready' }).toBeDefined();
    expect(bootReady()?.data.audioState, 'AudioContext state at SCR-BOOT').toBe('suspended');

    await pressStart(page, hasTouch);

    await expectScene(page, 'House');
    const unlocked = log.find((e) => e.event === 'boot.audio_unlocked');
    expect(unlocked, 'boot.audio_unlocked was logged').toBeDefined();
    expect(unlocked?.data.audioState).toBe('running');
    // The 300 ms budget targets Chrome on Android (checked here on Chromium and on the real tablet).
    // Headless WebKit's audio backend start varies (seen 300-400 ms), so there it only has to unlock.
    if (browserName === 'chromium') {
      expect(Number(unlocked?.data.latencyMs)).toBeLessThan(300);
    }
  });
});

test.describe('US-PRIV-01: nothing leaves the device', () => {
  test('US-PRIV-01 the app only requests its own origin', async ({ page, baseURL, hasTouch }) => {
    const origin = new URL(baseURL ?? '').origin;
    const foreign: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.origin !== origin) foreign.push(req.url());
    });

    await page.goto(GAME_URL);
    await expectScene(page, 'Boot');
    await pressStart(page, hasTouch);
    await expectScene(page, 'House');

    expect(foreign).toEqual([]);
  });
});

test('the app logs no errors or CSP violations through boot and the house', async ({
  page,
  hasTouch,
}) => {
  const log = collectLog(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(GAME_URL);
  await expectScene(page, 'Boot');
  await pressStart(page, hasTouch);
  await expectScene(page, 'House');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});
