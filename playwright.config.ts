import 'dotenv/config';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { assertTestDatabaseUrl } from './lib/security/test-mode';

// The specs delete users, Rewinds and service configs. Refuse anything but a
// dedicated *_test database, and point every process (global setup, helpers,
// specs and the web server) at it so `.env`'s DATABASE_URL is never used.
const databaseUrl = assertTestDatabaseUrl(process.env.E2E_DATABASE_URL);
process.env.DATABASE_URL = databaseUrl;

const port = process.env.E2E_PORT || '3100';
const baseURL = `http://localhost:${port}`;
// E2E_SERVER=prod builds the app and serves it with `next start`; the default
// is still `next dev`. Visual baselines are taken and compared only in prod.
const prodServer = process.env.E2E_SERVER === 'prod';
console.log(`Running tests on ${baseURL} (${prodServer ? 'production build' : 'next dev'})`);

const VISUAL_SPECS = /visual\/(member|admin)\.visual\.spec\.ts$/;
const VISUAL_SETUP_SPEC = /visual\/setup\.visual\.spec\.ts$/;
const visualDesktop = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
};
// Chromium with a phone viewport. devices['iPhone ...'] would switch to webkit,
// which arrives with the Rewind visual projects (P5.4).
const visualMobile = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Run tests sequentially to avoid database race conditions
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'], // Console output
    ['html', { open: 'never' }] // HTML report but don't auto-open
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Performance optimizations */
    screenshot: 'only-on-failure', // Only capture screenshots on failure
    video: 'retain-on-failure', // Only retain video on failure

    /* Reduce navigation timeout for faster failure detection */
    navigationTimeout: 15000, // 15 seconds (down from default 30s)
    actionTimeout: 10000, // 10 seconds for actions (down from default 30s)
  },

  /* Set up database before running tests */
  globalSetup: require.resolve('./e2e/global-setup.ts'),

  /* Visual regression (e2e/visual/README.md) */
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.01,
      stylePath: path.join(__dirname, 'e2e/visual/screenshot.css'),
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/setup-wizard\.spec\.ts/, /accessibility-setup\.spec\.ts/, /\.visual\.spec\.ts$/],
    },
    {
      name: 'setup-wizard',
      // The axe scan of /setup reopens setup too (P1.7).
      testMatch: [/setup-wizard\.spec\.ts/, /accessibility-setup\.spec\.ts/],
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'visual-desktop', testMatch: VISUAL_SPECS, use: visualDesktop },
    { name: 'visual-mobile', testMatch: VISUAL_SPECS, use: visualMobile },
    // Setup step 3 empties Setup.isComplete, so it runs after the wizard spec.
    {
      name: 'visual-setup-desktop',
      testMatch: VISUAL_SETUP_SPEC,
      dependencies: ['setup-wizard'],
      use: visualDesktop,
    },
    {
      name: 'visual-setup-mobile',
      testMatch: VISUAL_SETUP_SPEC,
      dependencies: ['setup-wizard'],
      use: visualMobile,
    },
  ],

  /* Run the app before starting the tests */
  webServer: {
    command: prodServer
      ? `npm run build:e2e && npx next start -p ${port}`
      : `npx next dev -p ${port}`,
    url: baseURL,
    // A running `npm run dev` points at the dev database, so only reuse a
    // server when asked to explicitly.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    // A production build takes minutes; `next dev` starts in seconds.
    timeout: prodServer ? 600000 : 30000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      // `next build` and `next start` expect production; `next dev` runs as test.
      NODE_ENV: prodServer ? 'production' : 'test',
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      NEXT_PUBLIC_ENABLE_TEST_AUTH: 'true',
      E2E_TEST_MODE: 'true',
      SKIP_CONNECTION_TESTS: 'true',
      FAST_REFRESH: 'false',
    },
  },
});

