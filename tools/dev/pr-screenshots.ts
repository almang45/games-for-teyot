// Not a test: captures PR screenshots at the AGENTS.md viewports.
// Usage: npm run build && (npx vite preview --port 4173 &) && npx tsx tools/dev/pr-screenshots.ts <outDir>
import { chromium, type Page } from '@playwright/test';

// CSS size × scale must equal the AGENTS.md device pixels exactly, so each scale divides both sides.
const VIEWPORTS = [
  { name: 'tablet-1920x1200', width: 1280, height: 800, scale: 1.5 },
  { name: 'phone-2400x1080', width: 960, height: 432, scale: 2.5 },
] as const;

async function main(outDir: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.scale,
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      await page.goto('http://localhost:4173/');
      await page.screenshot({ path: `${outDir}/${vp.name}-install.png` });
      await page.goto('http://localhost:4173/?browser=1');
      await page.locator('body[data-scene="Boot"]').waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}-boot.png` });
      const box = await page.locator('canvas').boundingBox();
      if (!box) throw new Error('canvas missing');
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.locator('body[data-scene="House"]').waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}-house.png` });
      await traceSpike(page, `${outDir}/${vp.name}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

/** US-TRACE-00: the spike with its debug panel, then a circle traced halfway with the panel folded. */
async function traceSpike(page: Page, prefix: string): Promise<void> {
  await page.goto('http://localhost:4173/?browser=1&spike=tracing');
  await page.locator('body[data-scene="TracingSpike"]').waitFor();
  await page.getByRole('button', { name: 'Circle', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${prefix}-spike-panel.png` });
  await page.getByRole('button', { name: 'Debug' }).click();
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas missing');
  // The glyph box is 72% of the height, centred; the circle starts at its top and runs left.
  const size = box.height * 0.72;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = size * 0.45;
  await page.mouse.move(cx, cy - r);
  await page.mouse.down();
  for (let a = 0; a <= Math.PI; a += 0.1) {
    await page.mouse.move(cx - r * Math.sin(a), cy - r * Math.cos(a));
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${prefix}-spike-tracing.png` });
}

main(process.argv[2] ?? '.').catch((err: unknown) => {
  const error =
    err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err);
  console.error(JSON.stringify({ level: 'error', event: 'screenshots.failed', error }));
  process.exitCode = 1;
});
