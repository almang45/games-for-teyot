import { expect, test } from '@playwright/test';
import {
  FRONT_ROOM_OFFSET,
  GAME_URL,
  collectLog,
  expectScene,
  pressStart,
  tapCanvas,
} from './helpers';

/** HouseScene's placeholder walk duration. */
const WALK_MS = 600;

test('SCR-HOUSE keeps Theia in the room she walked to when the screen resizes', async ({
  page,
  hasTouch,
}) => {
  const log = collectLog(page);
  await page.goto(GAME_URL);
  await expectScene(page, 'Boot');
  await pressStart(page, hasTouch);
  await expectScene(page, 'House');

  await tapCanvas(page, hasTouch, FRONT_ROOM_OFFSET);
  await expect
    .poll(() => log.find((e) => e.event === 'house.room_tap')?.data.room)
    .toBe('ruang-tamu');

  const layoutsBefore = log.filter((e) => e.event === 'house.layout').length;
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport size');
  // A rotate-like resize while she is still walking.
  await page.setViewportSize({ width: size.height * 2, height: size.height });

  await expect
    .poll(() => log.filter((e) => e.event === 'house.layout').length)
    .toBeGreaterThan(layoutsBefore);
  const latest = log.filter((e) => e.event === 'house.layout').at(-1);
  expect(latest?.data.theiaRoom).toBe('ruang-tamu');
  // She is drawn at the new centre of that room, not at stale pre-resize coordinates.
  expect(latest?.data.roomCenter).toBeDefined();
  expect(latest?.data.theia).toEqual(latest?.data.roomCenter);

  // And no walk left over from before the resize drags her somewhere else afterwards.
  const afterLayout = log.length;
  await page.waitForTimeout(WALK_MS + 200);
  const lateArrivals = log.slice(afterLayout).filter((e) => e.event === 'house.arrived');
  for (const arrival of lateArrivals) {
    expect(arrival.data.theia).toEqual(latest?.data.roomCenter);
  }
});
