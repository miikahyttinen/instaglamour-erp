import { defineConfig } from '@playwright/test';
import { backendPort, frontendPort, frontendUrl } from './scripts/env.mjs';

// `npm run e2e` first runs scripts/prepare.mjs (fresh e2e database + example seed), then this.
// Set E2E_REUSE=1 to reuse servers you already started with scripts/start-*.mjs.
const reuse = process.env.E2E_REUSE === '1';

export default defineConfig({
  testDir: './tests',
  // The suite shares one database and mutates it: run strictly in order, one worker.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: frontendUrl,
    locale: 'fi-FI',
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'mobile-375',
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop-1280',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'node scripts/start-backend.mjs',
      url: `http://127.0.0.1:${backendPort}/api/me`,
      // /api/me answers 401 without a session; Playwright counts 2xx, 3xx and 400–403 as ready.
      reuseExistingServer: reuse,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node scripts/start-frontend.mjs',
      url: `http://localhost:${frontendPort}/`,
      reuseExistingServer: reuse,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
