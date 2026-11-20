import { expect, test, type CDPSession, type Page } from '@playwright/test';
import {
  GAME_URL,
  collectLog,
  expectScene,
  pressStart,
  tapRoom,
  tapSky,
  type LoggedEvent,
} from './helpers';
import type { Point } from '../../contracts/common';
import { isPhone, MIN_TAP_DP } from '../../src/engine/camera/device';
import { roomAt } from '../../src/engine/nav/hit';
import { buildPlaceholderHouse } from '../../src/placeholder/house';

/**
 * The walks here take 1–3 s on a device, but Phaser caps each frame's delta at 1/60 s while the page
 * is unfocused, so a slow, unfocused CI browser walks in slow motion.
 */
const ARRIVAL_TIMEOUT = 40_000;

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

/**
 * Whether the `house.layout` the camera logs on settling has come in after the latest `settle`
 * event: they are separate console lines, so one can be collected before the other.
 */
const layoutAfter = (log: readonly LoggedEvent[], settle: string): boolean => {
  const settled = log.findLastIndex((e) => e.event === settle);
  return settled >= 0 && log.findLastIndex((e) => e.event === 'house.layout') > settled;
};

/** Waits for the camera's `count`th zoom into a room to settle and log its layout. */
async function focused(log: readonly LoggedEvent[], count: number): Promise<LoggedEvent[]> {
  await expect
    .poll(
      () =>
        events(log, 'house.room_focused').length >= count && layoutAfter(log, 'house.room_focused'),
      { timeout: ARRIVAL_TIMEOUT },
    )
    .toBe(true);
  return events(log, 'house.room_focused');
}

/** Waits for a `settle` event after the first `seen` of them, and the layout it logs. */
async function settledAfter(
  log: readonly LoggedEvent[],
  settle: string,
  seen: number,
): Promise<void> {
  await expect
    .poll(() => events(log, settle).length > seen && layoutAfter(log, settle), {
      timeout: ARRIVAL_TIMEOUT,
    })
    .toBe(true);
}

/** Waits for the camera to settle back on the overview and log its layout. */
async function overviewAfter(log: readonly LoggedEvent[], overviews: number): Promise<void> {
  await settledAfter(log, 'house.overview', overviews);
}

/**
 * Leaves the room she is zoomed into the placeholder way, a tap on the sky, and waits for the
 * camera: back on the overview, or on a phone on her room with every storey shown.
 */
async function leaveRoom(page: Page, touch: boolean, log: readonly LoggedEvent[]): Promise<void> {
  const settle = lastLayout(log)?.phone ? 'house.framed' : 'house.overview';
  const seen = events(log, settle).length;
  await tapSky(page, touch);
  await settledAfter(log, settle, seen);
}

interface HouseLayoutLog {
  readonly phone: boolean;
  readonly theiaRoom: string;
  readonly minTapDp: number;
  readonly height: number;
  readonly taps: Record<string, readonly number[] | null>;
  readonly scale: number;
  readonly zoomedTo: string | null;
  readonly view: readonly number[];
  readonly storeys: readonly number[];
  readonly width: number;
  readonly theia: readonly number[];
  readonly stands: Record<string, readonly number[]>;
}

const lastLayout = (log: readonly LoggedEvent[]): HouseLayoutLog | undefined =>
  events(log, 'house.layout').at(-1)?.data as HouseLayoutLog | undefined;

/** Taps a point in layout space, placed through the latest layout's scale and a room's stand. */
async function tapLayoutPoint(
  page: Page,
  touch: boolean,
  log: readonly LoggedEvent[],
  at: Point,
  anchor: { readonly id: string; readonly stand: Point },
): Promise<void> {
  const latest = lastLayout(log);
  const stand = latest?.stands[anchor.id];
  const box = await page.locator('canvas').boundingBox();
  if (!latest || !stand || stand.length < 2 || !box) throw new Error('No house.layout or canvas');
  const k = box.width / latest.width;
  const x = box.x + ((stand[0] ?? 0) + (at[0] - anchor.stand[0]) * latest.scale) * k;
  const y = box.y + ((stand[1] ?? 0) + (at[1] - anchor.stand[1]) * latest.scale) * k;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test('US-HOUSE-01 Theia walks to the tapped room through the door and up the stairs', async ({
  page,
  hasTouch,
}) => {
  test.slow();
  const log = await openHouse(page, hasTouch);
  await tapRoom(page, hasTouch, log, 'kantor-papa');

  await expect.poll(() => events(log, 'house.walk').at(0)?.data.room).toBe('kantor-papa');
  expect(events(log, 'house.walk').at(0)?.data.via).toEqual([
    'tangga-1-bawah',
    'tangga-1-atas',
    'kantor-papa',
  ]);
  const [arrival] = await arrivals(log, 1);
  expect(arrival?.data.room).toBe('kantor-papa');
  await focused(log, 1);
  await leaveRoom(page, hasTouch, log);

  await tapRoom(page, hasTouch, log, 'dapur');
  await expect
    .poll(() => events(log, 'house.walk').at(1)?.data.via)
    .toEqual(['tangga-1-atas', 'tangga-1-bawah', 'ruang-keluarga', 'pintu-dapur', 'dapur']);
  expect((await arrivals(log, 2)).at(1)?.data.room).toBe('dapur');
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});

test('US-HOUSE-01 a tap on another room while walking re-routes from her current position', async ({
  page,
  hasTouch,
}) => {
  test.slow();
  const log = await openHouse(page, hasTouch);
  // kantor-papa, not a room further up: it shows on the phone's opening view too.
  await tapRoom(page, hasTouch, log, 'kantor-papa');
  // Halfway up the stairs, whatever the frame rate: she is well off the stand she started on. Polled
  // every frame or so, as the default back-off can sleep through the second half of a fast walk.
  await expect
    .poll(() => events(log, 'house.companions_following').length, {
      timeout: ARRIVAL_TIMEOUT,
      intervals: [20],
    })
    .toBe(1);
  await tapRoom(page, hasTouch, log, 'dapur');

  await expect.poll(() => events(log, 'house.walk').length).toBe(2);
  // The second tap re-routed her before she reached kantor-papa.
  expect(events(log, 'house.arrived')).toEqual([]);
  const [first, second] = events(log, 'house.walk');
  const via = second?.data.via as string[];
  expect(via.at(-1)).toBe('dapur');
  expect(via).not.toContain('kantor-papa');
  // Logged after the re-route: still where she was, not back at the start.
  expect(second?.data.theia).not.toEqual(first?.data.theia);
  const [arrival] = await arrivals(log, 1);
  expect(arrival?.data.room).toBe('dapur');
  // Parking needs her standing still in dapur, so the dropped walk did not resume.
  await expect
    .poll(() => events(log, 'house.companions_parked').at(-1)?.data, { timeout: ARRIVAL_TIMEOUT })
    .toEqual({ room: 'dapur' });
  expect(events(log, 'house.arrived').map((e) => e.data.room)).toEqual(['dapur']);
});

test('US-HOUSE-01 a tap outside every room walks nowhere and Bubu tilts her head', async ({
  page,
  hasTouch,
}) => {
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => events(log, 'house.layout').length).toBeGreaterThan(0);
  await tapSky(page, hasTouch);

  await expect.poll(() => events(log, 'house.tap_outside').length).toBe(1);
  expect(events(log, 'house.bubu_tilt')).toHaveLength(1);
  expect(events(log, 'house.room_tap')).toEqual([]);
  expect(events(log, 'house.walk')).toEqual([]);
  expect(events(log, 'house.zoom_out')).toEqual([]);
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
  test.slow();
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
  await focused(log, 1);

  // Another resize after she arrived refits her with the zoomed house: still on the dapur stand.
  const settled = events(log, 'house.layout').length;
  await page.setViewportSize(size);
  await expect.poll(() => events(log, 'house.layout').length).toBeGreaterThan(settled);
  const latest = lastLayout(log);
  expect(latest?.zoomedTo).toBe('dapur');
  expect(latest?.theia).toEqual(latest?.stands.dapur);
  expect(events(log, 'house.arrived')).toHaveLength(1);
});

test('US-HOUSE-02 Bubu and Ocica follow Theia up the stairs and settle by her in the room', async ({
  page,
  hasTouch,
}) => {
  test.slow();
  const log = await openHouse(page, hasTouch);
  await tapRoom(page, hasTouch, log, 'kantor-papa');
  const [arrival] = await arrivals(log, 1);
  expect(arrival?.data.room).toBe('kantor-papa');

  // Halfway there: Bubu hops ahead of her and Ocica waddles behind.
  const following = events(log, 'house.companions_following').at(0)?.data as
    { bubuAhead: number; ocicaBehind: number } | undefined;
  expect(following?.bubuAhead).toBeGreaterThan(0);
  expect(following?.ocicaBehind).toBeGreaterThan(0);

  await expect
    .poll(() => events(log, 'house.companions_parked').at(0)?.data, { timeout: ARRIVAL_TIMEOUT })
    .toEqual({ room: 'kantor-papa' });
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});

test('US-HOUSE-01 on arrival the camera zooms into the room and fades the storeys above; leaving zooms back out', async ({
  page,
  hasTouch,
}) => {
  test.skip(onPhone(page), 'The phone opens on her room, not the whole house: US-HOUSE-05 below');
  test.slow();
  const { layout } = buildPlaceholderHouse();
  const dapur = layout.rooms.find((r) => r.id === 'dapur');
  const office = layout.rooms.find((r) => r.id === 'kantor-papa');
  if (!dapur || !office) throw new Error('placeholder house rooms missing');
  // A spot on the office floor (storey 1) inside the kitchen's shot, with no ground-floor room under it.
  const [fx, , fw] = dapur.focus;
  const officeFloor: Point = [fx + fw - 40, office.stand[1]];
  expect(roomAt(layout, officeFloor)?.id).toBe('kantor-papa');
  expect(roomAt(layout, officeFloor, (r) => r.storey === 0)).toBeUndefined();

  const log = await openHouse(page, hasTouch);
  await expect.poll(() => lastLayout(log)).toBeDefined();
  const overview = lastLayout(log);
  expect(overview?.zoomedTo).toBeNull();
  expect(overview?.view).toEqual([0, 0, 1920, 1200]);
  expect(overview?.storeys).toEqual([1, 1, 1, 1]);

  await tapRoom(page, hasTouch, log, 'dapur');
  await arrivals(log, 1);
  const [focus] = await focused(log, 1);
  expect(focus?.data).toEqual({ room: 'dapur' });
  const zoomed = lastLayout(log);
  expect(zoomed?.zoomedTo).toBe('dapur');
  expect(zoomed?.view).toEqual(dapur.focus);
  expect(zoomed?.scale).toBeGreaterThan(overview?.scale ?? Infinity);
  // Every storey above the kitchen has faded out.
  expect(zoomed?.storeys).toEqual([1, 0, 0, 0]);

  // A tap on the room she is in belongs to its activity: no walk, no zoom.
  await tapRoom(page, hasTouch, log, 'dapur');
  await expect
    .poll(() => events(log, 'house.tap_in_room').map((e) => e.data))
    .toEqual([{ room: 'dapur' }]);
  expect(events(log, 'house.walk')).toHaveLength(1);
  expect(events(log, 'house.zoom_out')).toEqual([]);

  // The faded office floor does not catch the tap: it only leaves the kitchen, with no walk.
  const overviews = events(log, 'house.overview').length;
  await tapLayoutPoint(page, hasTouch, log, officeFloor, dapur);
  await overviewAfter(log, overviews);
  expect(events(log, 'house.zoom_out').map((e) => e.data)).toEqual([{ room: 'dapur' }]);
  expect(events(log, 'house.room_tap').map((e) => e.data.room)).toEqual(['dapur']);
  const back = lastLayout(log);
  expect(back?.zoomedTo).toBeNull();
  expect(back?.view).toEqual([0, 0, 1920, 1200]);
  expect(back?.storeys).toEqual([1, 1, 1, 1]);
  expect(events(log, 'house.walk')).toHaveLength(1);
  expect(events(log, 'house.tap_outside')).toEqual([]);
  expect(events(log, 'house.bubu_tilt')).toEqual([]);
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});

/** The game's own rule (src/engine/camera/device.ts) for the viewport this project runs. */
function onPhone(page: Page): boolean {
  const size = page.viewportSize();
  return size !== null && isPhone(size.width, size.height);
}

/** A layout point in game px through the latest layout: scale and one stand fix the stage. */
function toGame(latest: HouseLayoutLog, at: Point, anchor: { id: string; stand: Point }): Point {
  const stand = latest.stands[anchor.id] ?? [];
  return [
    (stand[0] ?? 0) + (at[0] - anchor.stand[0]) * latest.scale,
    (stand[1] ?? 0) + (at[1] - anchor.stand[1]) * latest.scale,
  ];
}

const onScreen = (latest: HouseLayoutLog, [x, y]: Point): boolean =>
  x >= 0 && y >= 0 && x <= latest.width && y <= latest.height;

/**
 * Real multi-touch through the Chromium DevTools protocol, which Playwright's touchscreen lacks:
 * each finger moves from its `from` to its `to` in game px, over `steps` moves. The events are
 * queued together, as a round trip per move can take longer than a flick on a loaded machine.
 */
async function touchGesture(
  page: Page,
  cdp: CDPSession,
  latest: HouseLayoutLog,
  fingers: readonly { from: Point; to: Point }[],
  steps = 6,
): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Game canvas has no layout box');
  const k = box.width / latest.width;
  const at = (t: number): { x: number; y: number; id: number }[] =>
    fingers.map(({ from, to }, id) => ({
      x: box.x + (from[0] + (to[0] - from[0]) * t) * k,
      y: box.y + (from[1] + (to[1] - from[1]) * t) * k,
      id,
    }));
  // CDP handles a session's commands in the order sent, so these make one gesture, start to end.
  const sent = [cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) })];
  for (let i = 1; i <= steps; i++) {
    sent.push(
      cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) }),
    );
  }
  sent.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
  await Promise.all(sent);
}

/** Waits for the view to come to rest after a drag or pinch, and the layout it logs. */
async function pannedAfter(log: readonly LoggedEvent[], seen: number): Promise<HouseLayoutLog> {
  await settledAfter(log, 'house.panned', seen);
  const latest = lastLayout(log);
  if (!latest) throw new Error('No house.layout after house.panned');
  return latest;
}

test('US-HOUSE-05 on the tablet and laptops the whole house fits on screen, every tap area at least 72 dp', async ({
  page,
  hasTouch,
}) => {
  test.skip(onPhone(page), 'The phone opens on her room: the tests below');
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => lastLayout(log)).toBeDefined();
  const latest = lastLayout(log);
  if (!latest) throw new Error('No house.layout');
  expect(latest.phone).toBe(false);
  expect(latest.view).toEqual([0, 0, 1920, 1200]);
  expect(latest.minTapDp).toBeGreaterThanOrEqual(MIN_TAP_DP);
  for (const [room, stand] of Object.entries(latest.stands)) {
    expect(onScreen(latest, [stand[0] ?? -1, stand[1] ?? -1]), room).toBe(true);
    expect(latest.taps[room], room).toEqual(stand);
  }
});

test('US-HOUSE-05 on the phone the hub opens zoomed to her room, and a tap on a room partly on screen brings it into view', async ({
  page,
  hasTouch,
}) => {
  test.skip(!onPhone(page), 'Only the phone opens zoomed to her room');
  test.slow();
  const { layout } = buildPlaceholderHouse();
  const kitchen = layout.rooms.find((r) => r.id === 'dapur');
  if (!kitchen) throw new Error('placeholder house has no dapur');
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => lastLayout(log)).toBeDefined();
  const opening = lastLayout(log);
  if (!opening) throw new Error('No house.layout');
  expect(opening.phone).toBe(true);
  expect(opening.theiaRoom).toBe(layout.start);
  expect(opening.zoomedTo).toBeNull();
  expect(opening.storeys).toEqual([1, 1, 1, 1]);
  expect(opening.minTapDp).toBeGreaterThanOrEqual(MIN_TAP_DP);
  // Zoomed in: the bedroom two storeys up is off screen, and the kitchen is only partly on it.
  expect(opening.taps['kamar-tidur']).toBeNull();
  const corners = (latest: HouseLayoutLog): boolean[] =>
    kitchen.polygon.map((p) => onScreen(latest, toGame(latest, p, kitchen)));
  expect(corners(opening)).toContain(false);
  expect(corners(opening)).toContain(true);

  const framings = events(log, 'house.framed').length;
  await tapRoom(page, hasTouch, log, 'dapur');
  await settledAfter(log, 'house.framed', framings);
  expect(events(log, 'house.framed').at(-1)?.data).toEqual({ room: 'dapur' });
  expect(corners(lastLayout(log) ?? opening)).toEqual([true, true, true, true]);

  // On arrival the zoom fades the storeys above her as on the tablet, and leaving brings them back.
  await arrivals(log, 1);
  await focused(log, 1);
  expect(lastLayout(log)?.zoomedTo).toBe('dapur');
  expect(lastLayout(log)?.storeys).toEqual([1, 0, 0, 0]);
  await leaveRoom(page, hasTouch, log);
  expect(events(log, 'house.framed').at(-1)?.data).toEqual({ room: 'dapur' });
  expect(lastLayout(log)?.zoomedTo).toBeNull();
  expect(lastLayout(log)?.storeys).toEqual([1, 1, 1, 1]);
  expect(events(log, 'house.overview')).toEqual([]);
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});

test('US-HOUSE-05 on the phone a drag pans the house with inertia, and a room dragged into view takes a tap', async ({
  page,
  hasTouch,
}) => {
  test.skip(!onPhone(page), 'Drag to pan is the phone hub');
  test.slow();
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => lastLayout(log)).toBeDefined();
  const opening = lastLayout(log);
  if (!opening) throw new Error('No house.layout');
  const cdp = await page.context().newCDPSession(page);
  const x = opening.width / 2;
  const reach = opening.height * 0.4;
  // A quick flick down, to see the storeys above her.
  await touchGesture(page, cdp, opening, [
    { from: [x, opening.height * 0.3], to: [x, opening.height * 0.3 + reach] },
  ]);
  const panned = await pannedAfter(log, 0);
  // The house kept gliding after the finger let go: it moved further than the finger did.
  const fingerMoved = reach / panned.scale;
  expect(opening.view[1] ?? 0).toBeGreaterThan(panned.view[1] ?? 0);
  expect((opening.view[1] ?? 0) - (panned.view[1] ?? 0)).toBeGreaterThan(fingerMoved + 10);
  expect(panned.view[1]).toBeGreaterThanOrEqual(0);
  // A drag is not a tap.
  expect(events(log, 'house.room_tap')).toEqual([]);
  expect(events(log, 'house.tap_outside')).toEqual([]);

  expect(panned.taps['kamar-tidur']).not.toBeNull();
  await tapRoom(page, hasTouch, log, 'kamar-tidur');
  await expect.poll(() => events(log, 'house.walk').at(0)?.data.room).toBe('kamar-tidur');
  expect(log.filter((e) => e.level === 'error')).toEqual([]);
});

test('US-HOUSE-05 on the phone a pinch-out shows the whole house, every tap area at least 72 dp', async ({
  page,
  hasTouch,
}) => {
  test.skip(!onPhone(page), 'Pinch is the phone hub');
  const log = await openHouse(page, hasTouch);
  await expect.poll(() => lastLayout(log)).toBeDefined();
  const opening = lastLayout(log);
  if (!opening) throw new Error('No house.layout');
  const cdp = await page.context().newCDPSession(page);
  const [cx, cy] = [opening.width / 2, opening.height / 2];
  const spread = opening.height * 0.4;
  // Two fingers close in from far apart: a third of the spread zooms out past the whole house.
  await touchGesture(page, cdp, opening, [
    { from: [cx - spread, cy], to: [cx - spread / 3, cy] },
    { from: [cx + spread, cy], to: [cx + spread / 3, cy] },
  ]);
  const whole = await pannedAfter(log, 0);
  expect(whole.view).toEqual([0, 0, 1920, 1200]);
  expect(whole.minTapDp).toBeGreaterThanOrEqual(MIN_TAP_DP);
  for (const [room, stand] of Object.entries(whole.stands)) {
    expect(whole.taps[room], room).toEqual(stand);
  }
  expect(events(log, 'house.room_tap')).toEqual([]);
  expect(events(log, 'house.tap_outside')).toEqual([]);
});
