import { expect, test, type Page } from '@playwright/test';
import {
  GAME_URL,
  collectLog,
  expectScene,
  pressStart,
  tapRoom,
  type LoggedEvent,
} from './helpers';

/** The longest placeholder walk (ruang-keluarga → kamar-tidur) takes about 4 s. */
const ARRIVAL_TIMEOUT = 15_000;

async function openHouse(page: Page, touch: boolean): Promise<LoggedEvent[]> {
  const log = collectLog(page);
  await page.goto(GAME_URL);
  await expectScene(page, 'Boot');
  await pressStart(page, touch);
  await expectScene(page, 'House');
  return log;
}

const events = (log: readonly LoggedEvent[], name: string): LoggedEvent[] =>
  log.filter((e) => e.event === name);

async function arrivals(log: readonly LoggedEvent[], count: number): Promise<LoggedEvent[]> {
  await expect
    .poll(() => events(log, 'house.arrived').length, { timeout: ARRIVAL_TIMEOUT })
    .toBeGreaterThanOrEqual(count);
  return events(log, 'house.arrived');
}

test('US-HOUSE-01 Theia walks to the tapped room through the door and up the stairs', async ({
  page,
  hasTouch,
}) => {
  const log = await openHouse(page, hasTouch);
  await tapRoom(page, hasTouch, log, 'kamar-tidur');

  await expect.poll(() => events(log, 'house.walk').at(0)?.data.room).toBe('kamar-tidur');
  expect(events(log, 'house.walk').at(0)?.data.via).toEqual([
    'tangga-1-bawah',
    'tangga-1-atas',
    'kantor-papa',
    'tangga-2-bawah',
    'tangga-2-atas',
    'kamar-tidur',
  ]);
  const [arrival] = await arrivals(log, 1);
  expect(arrival?.data.room).toBe('kamar-tidur');

  await tapRoom(page, hasTouch, log, 'dapur');
  await expect
    .poll(() => events(log, 'house.walk').at(1)?.data.via)
    .toEqual([
      'tangga-2-atas',
      'tangga-2-bawah',
      'kantor-papa',
      'tangga-1-atas',
      'tangga-1-bawah',
      'ruang-keluarga',
      'pintu-dapur',
      'dapur',
    ]);
  expect((await arrivals(log, 2)).at(1)?.data.room).toBe('dapur');
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});

test('US-HOUSE-01 a tap on another room while walking re-routes from her current position', async ({
  page,
  hasTouch,
}) => {
  const log = await openHouse(page, hasTouch);
  await tapRoom(page, hasTouch, log, 'kamar-tidur');
  await expect.poll(() => events(log, 'house.walk').length).toBe(1);
  await page.waitForTimeout(300);
  await tapRoom(page, hasTouch, log, 'dapur');

  await expect.poll(() => events(log, 'house.walk').length).toBe(2);
  const via = events(log, 'house.walk').at(1)?.data.via as string[];
  expect(via.at(-1)).toBe('dapur');
  expect(via).not.toContain('kamar-tidur');
  const [arrival] = await arrivals(log, 1);
  expect(arrival?.data.room).toBe('dapur');
  // The first walk was dropped, not finished afterwards.
  await page.waitForTimeout(500);
  expect(events(log, 'house.arrived').map((e) => e.data.room)).toEqual(['dapur']);
});

test('US-HOUSE-01 a tap outside every room does nothing', async ({ page, hasTouch }) => {
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => events(log, 'house.layout').length).toBeGreaterThan(0);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Game canvas has no layout box');
  // The top corners of the frame are sky on every viewport.
  if (hasTouch) await page.touchscreen.tap(box.x + 12, box.y + 12);
  else await page.mouse.click(box.x + 12, box.y + 12);

  await expect.poll(() => events(log, 'house.tap_outside').length).toBe(1);
  expect(events(log, 'house.room_tap')).toEqual([]);
  expect(events(log, 'house.walk')).toEqual([]);
});

test('US-HOUSE-01 a drag that ends on a room is not a tap', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Playwright touch input has no drag; the mouse covers the same pointer path');
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => events(log, 'house.layout').length).toBeGreaterThan(0);
  const latest = events(log, 'house.layout').at(-1)?.data as
    { width: number; stands: Record<string, [number, number]> } | undefined;
  const stand = latest?.stands.dapur;
  const box = await page.locator('canvas').boundingBox();
  if (!latest || !stand || !box) throw new Error('No house.layout or canvas box');
  const k = box.width / latest.width;
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + stand[0] * k, box.y + stand[1] * k, { steps: 5 });
  await page.mouse.up();
  await page.mouse.click(box.x + stand[0] * k, box.y + stand[1] * k, { button: 'right' });

  await page.waitForTimeout(300);
  expect(events(log, 'house.room_tap')).toEqual([]);
  expect(events(log, 'house.tap_outside')).toEqual([]);
});

test('SCR-HOUSE carries a walk on through a resize and keeps her where she arrived', async ({
  page,
  hasTouch,
}) => {
  const log = await openHouse(page, hasTouch);
  await tapRoom(page, hasTouch, log, 'dapur');
  await expect.poll(() => events(log, 'house.walk').length).toBe(1);

  const size = page.viewportSize();
  if (!size) throw new Error('No viewport size');
  const layoutsBefore = events(log, 'house.layout').length;
  // A rotate-like resize while she is still walking.
  await page.setViewportSize({ width: size.height * 2, height: size.height });
  await expect.poll(() => events(log, 'house.layout').length).toBeGreaterThan(layoutsBefore);
  expect(events(log, 'house.layout').at(-1)?.data.theiaRoom).toBe('dapur');

  const [arrival] = await arrivals(log, 1);
  expect(arrival?.data.room).toBe('dapur');

  // Another resize after she arrived refits her with the house: still on the dapur stand.
  const settled = events(log, 'house.layout').length;
  await page.setViewportSize(size);
  await expect.poll(() => events(log, 'house.layout').length).toBeGreaterThan(settled);
  const latest = events(log, 'house.layout').at(-1)?.data as
    { theia: [number, number]; stands: Record<string, [number, number]> } | undefined;
  expect(latest?.theia).toEqual(latest?.stands.dapur);
  expect(events(log, 'house.arrived')).toHaveLength(1);
});
