import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Viewports in CSS pixels for the family's devices (PRD NFR-COMPAT-01), landscape:
 * Tab S10+ ≈ 1280×800, Pixel 6 ≈ 915×412, laptops 1440×900 with a mouse.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'tablet-chromium',
      use: { ...devices['Galaxy Tab S9 landscape'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone-chromium',
      use: { ...devices['Pixel 7 landscape'], viewport: { width: 915, height: 412 } },
    },
    {
      name: 'laptop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'laptop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
