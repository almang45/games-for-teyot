import { readFileSync } from 'node:fs';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { loadGlyph, type GlyphSource } from '../../src/engine/tracing/glyph';
import { pointAt, type Point } from '../../src/engine/tracing/path';
import { collectLog, expectScene, type LoggedEvent } from './helpers';

const SPIKE_URL = '/?browser=1&spike=tracing';
const ITEMS = {
  vertical: { label: 'Vertical', file: 'stroke.vertical' },
  circle: { label: 'Circle', file: 'stroke.circle' },
  one: { label: 'Digit 1', file: 'digit.1' },
} as const;
type ItemId = keyof typeof ITEMS;
/** Sample spacing along a stroke, in glyph heights: well inside the 0.25 H look-ahead window. */
const STEP = 0.05;

interface StrokeStart {
  readonly box: { readonly x: number; readonly y: number; readonly size: number };
  readonly frame: { readonly width: number; readonly height: number };
}

/** Points along the item's first stroke, in glyph units, shifted sideways by `offsetX`. */
function strokePoints(item: ItemId, offsetX = 0): Point[] {
  const raw = readFileSync(`src/content/glyphs/${ITEMS[item].file}.json`, 'utf8');
  const stroke = loadGlyph(JSON.parse(raw) as GlyphSource).strokes[0];
  if (!stroke) throw new Error(`${item} has no stroke`);
  const points: Point[] = [];
  for (let s = 0; s < stroke.length; s += STEP) points.push(pointAt(stroke, s));
  points.push(pointAt(stroke, stroke.length));
  return points.map((p) => ({ x: p.x + offsetX, y: p.y }));
}

/** Glyph units → viewport CSS px, from the geometry the scene logs at each stroke start. */
async function toViewport(page: Page, start: LoggedEvent, points: Point[]): Promise<Point[]> {
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Game canvas has no layout box');
  const { box, frame } = start.data as unknown as StrokeStart;
  const k = canvas.width / frame.width;
  return points.map((p) => ({
    x: canvas.x + (box.x + p.x * box.size) * k,
    y: canvas.y + (box.y + p.y * box.size) * k,
  }));
}

/** Opens an item from the debug panel, folds the panel away, and returns its stroke start. */
async function openItem(page: Page, log: LoggedEvent[], item: ItemId): Promise<LoggedEvent> {
  const from = log.length;
  await page.getByRole('button', { name: ITEMS[item].label, exact: true }).click();
  await page.getByRole('button', { name: 'Debug' }).click();
  await expect(page.locator('.spike-panel__body')).toBeHidden();
  const start = (): LoggedEvent | undefined =>
    log.slice(from).find((e) => e.event === 'spike.trace.stroke_start' && e.data.item === item);
  await expect.poll(start).toBeDefined();
  const found = start();
  if (!found) throw new Error(`${item} never started`);
  return found;
}

async function traceWithMouse(page: Page, points: Point[]): Promise<void> {
  const [first, ...rest] = points;
  if (!first) return;
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
}

interface Touch {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Half the contact width, in CSS px. */
  readonly radius?: number;
}

/** Chromium's touch input: `touches` is every finger on the screen for this event. */
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  touches: Touch[],
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: touches.map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      radiusX: t.radius ?? 8,
      radiusY: t.radius ?? 8,
    })),
  });
}

/** Traces with finger `id` while `resting` fingers stay down, then lifts it. */
async function traceWithFinger(
  cdp: CDPSession,
  points: Point[],
  id: number,
  resting: Touch[] = [],
): Promise<void> {
  const [first, ...rest] = points;
  if (!first) return;
  await touch(cdp, 'touchStart', [...resting, { id, ...first }]);
  for (const p of rest) await touch(cdp, 'touchMove', [...resting, { id, ...p }]);
  await touch(cdp, 'touchEnd', resting);
}

const events = (log: LoggedEvent[], name: string, from = 0): LoggedEvent[] =>
  log.slice(from).filter((e) => e.event === name);

test.describe('US-TRACE-00 tracing spike', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SPIKE_URL);
    await expectScene(page, 'TracingSpike');
  });

  test('US-TRACE-00 traces the vertical stroke, the circle and the digit 1 in Follow mode', async ({
    page,
    hasTouch,
    browserName,
  }) => {
    // Headless WebGL renders in software, so each input event waits for a slow frame.
    test.slow();
    const log = collectLog(page);
    const cdp =
      hasTouch && browserName === 'chromium' ? await page.context().newCDPSession(page) : undefined;
    for (const item of Object.keys(ITEMS) as ItemId[]) {
      const start = await openItem(page, log, item);
      const from = log.length;
      const points = await toViewport(page, start, strokePoints(item));
      if (cdp) await traceWithFinger(cdp, points, 1);
      else await traceWithMouse(page, points);
      await expect.poll(() => events(log, 'spike.trace.item_done', from).length).toBe(1);
      const done = events(log, 'spike.trace.stroke_done', from)[0];
      expect(done?.data.item).toBe(item);
      // Every sample that moved the ink reached a frame, so latency was measured.
      expect((done?.data.latency as { count: number } | null)?.count).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Debug' }).click();
    }
  });

  test('US-TRACE-00 a second finger and a resting palm do not draw', async ({
    page,
    hasTouch,
    browserName,
  }) => {
    test.skip(!hasTouch || browserName !== 'chromium', 'needs multi-touch input');
    const log = collectLog(page);
    const cdp = await page.context().newCDPSession(page);
    const start = await openItem(page, log, 'vertical');
    const path = await toViewport(page, start, strokePoints('vertical'));
    const ball = path[0];
    if (!ball) throw new Error('no stroke start');

    // A palm on the ball: its contact (160 px) is wider than the 90 px palm limit.
    const palm: Touch = { id: 9, ...ball, radius: 80 };
    await touch(cdp, 'touchStart', [palm]);
    await expect
      .poll(() => events(log, 'spike.trace.pointer_ignored').map((e) => e.data.reason))
      .toContain('palm');

    // Finger 1 rests on the ball; finger 2 traces the whole stroke, which must not count.
    const resting: Touch = { id: 1, ...ball };
    await touch(cdp, 'touchStart', [palm, resting]);
    const from = log.length;
    await traceWithFinger(cdp, path, 2, [palm, resting]);
    await expect
      .poll(() => events(log, 'spike.trace.pointer_ignored', from).map((e) => e.data.reason))
      .toContain('second-pointer');
    await page.waitForTimeout(200);
    expect(events(log, 'spike.trace.stroke_done', from)).toHaveLength(0);

    // Finger 1, the first touch, draws it, with the palm still down.
    for (const p of path) await touch(cdp, 'touchMove', [palm, { id: 1, ...p }]);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(() => events(log, 'spike.trace.item_done', from).length).toBe(1);
  });

  test('US-TRACE-00 tolerance can be changed live in the debug panel', async ({
    page,
    hasTouch,
    browserName,
  }) => {
    const log = collectLog(page);
    const cdp =
      hasTouch && browserName === 'chromium' ? await page.context().newCDPSession(page) : undefined;
    const trace = async (points: Point[]): Promise<void> => {
      if (cdp) await traceWithFinger(cdp, points, 1);
      else await traceWithMouse(page, points);
    };
    const start = await openItem(page, log, 'vertical');
    // 0.16 H beside the path: outside the default corridor (0.12) and reach (0.15).
    const beside = await toViewport(page, start, strokePoints('vertical', 0.16));
    let from = log.length;
    await trace(beside);
    await expect
      .poll(() => events(log, 'spike.trace.pointer_ignored', from).map((e) => e.data.reason))
      .toContain('out-of-reach');
    expect(events(log, 'spike.trace.stroke_done', from)).toHaveLength(0);

    await page.getByRole('button', { name: 'Debug' }).click();
    await page.locator('input[name="corridor"]').fill('0.2');
    await expect.poll(() => events(log, 'spike.trace.settings').at(-1)?.data.corridor).toBe(0.2);
    await page.getByRole('button', { name: 'Debug' }).click();

    from = log.length;
    await trace(beside);
    await expect.poll(() => events(log, 'spike.trace.item_done', from).length).toBe(1);
    expect(events(log, 'spike.trace.stroke_done', from)[0]?.data.corridor).toBe(0.2);
  });
});
