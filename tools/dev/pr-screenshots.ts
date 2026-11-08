// Not a test: captures PR screenshots at the AGENTS.md viewports.
// Usage: npm run build && (npx vite preview --port 4173 &) && npx tsx tools/dev/pr-screenshots.ts <outDir>
import { chromium } from '@playwright/test';

const VIEWPORTS = [
  { name: 'tablet-1920x1200', width: 1280, height: 800, scale: 1.5 },
  { name: 'phone-2400x1080', width: 2400 / 2.625, height: 1080 / 2.625, scale: 2.625 },
] as const;

async function main(outDir: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: Math.round(vp.width), height: Math.round(vp.height) },
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
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main(process.argv[2] ?? '.').catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
