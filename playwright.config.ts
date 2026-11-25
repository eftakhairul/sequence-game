import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the BUILT app (`pnpm build`) served by `node apps/server/dist/index.js`
 * with TEST_MODE=1.
 *
 * Projects: Chromium + WebKit desktop, and an iPhone 13 profile (WebKit) for the mobile spec.
 * Set E2E_NO_WEBKIT=1 where WebKit is not installed: the WebKit project is dropped and the
 * iPhone 13 profile runs on Chromium instead.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const noWebkit = process.env.E2E_NO_WEBKIT === '1';
const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    ...(noWebkit
      ? []
      : [{ name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /mobile\.spec/ }]),
    {
      name: 'mobile',
      use: noWebkit ? { ...iphone, browserName: 'chromium' as const } : { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec/,
    },
  ],
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      TEST_MODE: '1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      // All E2E players share 127.0.0.1, so lift the per-IP room-creation limit.
      ROOM_CREATE_LIMIT: '1000',
    },
    timeout: 30_000,
  },
});
