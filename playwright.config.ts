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

const VISUAL_SPECS = /visual\/(member|admin|primitives)\.visual\.spec\.ts$/;
const VISUAL_SETUP_SPEC = /visual\/setup\.visual\.spec\.ts$/;
/*
 * The light theme (P10.10): `light-theme-setup` turns the flag on through the
 * settings Switch and its teardown turns it off; the light projects hold the
 * `pm-theme=light` cookie. They run the app screens plus every route in the
 * axe table, axe itself, and Rewind against the dark Rewind baselines, which
 * proves the Rewind scope does not change with the theme. Not in CI's list;
 * the Visual Baselines workflow's `light` suite takes their baselines.
 */
const LIGHT_ROUTES_SPEC = /visual\/light-routes\.visual\.spec\.ts$/;
// The light projects start with the `pm-theme=light` cookie that
// `lib/design/theme.ts` reads. Kept here, not in e2e/, because `next build`
// type-checks this file and the image's build context leaves e2e/ out.
const lightTheme = {
  storageState: {
    cookies: [
      {
        name: 'pm-theme',
        value: 'light',
        domain: new URL(baseURL).hostname,
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  },
};
const visualDesktop = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
};
// Chromium with a phone viewport. devices['iPhone ...'] would switch to webkit.
const visualMobile = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

/*
 * Rewind (P5.4, e2e/README.md "Rewind"): screenshots on chromium and webkit,
 * axe on chromium, webkit and firefox (firefox runs the @article tests only),
 * the throttled performance gate on chromium (it needs CDP) and the story
 * flows on chromium and webkit. Each spec folder belongs to these projects
 * alone, so the `chromium` project ignores them.
 */
const REWIND_VISUAL_SPECS = /visual\/rewind[^/]*\.spec\.ts$/;
const REWIND_A11Y_SPECS = /a11y\/rewind[^/]*\.a11y\.spec\.ts$/;
const REWIND_PERF_SPECS = /perf\/[^/]*\.perf\.spec\.ts$/;
const REWIND_E2E_SPECS = /rewind\/[^/]*\.spec\.ts$/;
// The public share page (P7.5, design 12) and the archive article (P7.13) also run on firefox.
const REWIND_FIREFOX_SPECS = /rewind\/(?:share-page|archive)\.spec\.ts$/;
// The visual specs loop over the five phone sizes themselves; this is the first.
const rewindPhone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const rewindDesktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
// axe and the story flows run at the roomy phone size; firefox has no isMobile.
const rewindPhoneViewport = { viewport: { width: 390, height: 844 } };
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
      testIgnore: [
        /setup-wizard\.spec\.ts/,
        /accessibility-setup\.spec\.ts/,
        /\.visual\.spec\.ts$/,
        REWIND_VISUAL_SPECS,
        REWIND_A11Y_SPECS,
        REWIND_PERF_SPECS,
        REWIND_E2E_SPECS,
      ],
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
    {
      name: 'light-theme-setup',
      testMatch: /light-theme\.setup\.ts$/,
      teardown: 'light-theme-teardown',
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'light-theme-teardown', testMatch: /light-theme\.teardown\.ts$/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'visual-light-desktop',
      testMatch: [VISUAL_SPECS, LIGHT_ROUTES_SPEC],
      dependencies: ['light-theme-setup'],
      use: { ...visualDesktop, ...lightTheme },
    },
    {
      name: 'visual-light-mobile',
      testMatch: [VISUAL_SPECS, LIGHT_ROUTES_SPEC],
      dependencies: ['light-theme-setup'],
      use: { ...visualMobile, ...lightTheme },
    },
    {
      // Compared with the dark phone baselines: the Rewind scope looks the same in both themes.
      name: 'visual-light-rewind',
      testMatch: /visual\/rewind\.spec\.ts$/,
      dependencies: ['light-theme-setup'],
      snapshotPathTemplate: '{testDir}/visual/__screenshots__/rewind-visual-phone-chromium/{testFilePath}/{arg}{ext}',
      use: { ...devices['Desktop Chrome'], ...rewindPhone, ...lightTheme },
    },
    {
      name: 'a11y-light',
      testMatch: /\/accessibility\.spec\.ts$/,
      dependencies: ['light-theme-setup'],
      use: { ...devices['Desktop Chrome'], ...lightTheme },
    },
    { name: 'rewind-visual-phone-chromium', testMatch: REWIND_VISUAL_SPECS, use: { ...devices['Desktop Chrome'], ...rewindPhone } },
    { name: 'rewind-visual-phone-webkit', testMatch: REWIND_VISUAL_SPECS, use: { ...devices['Desktop Safari'], ...rewindPhone } },
    { name: 'rewind-visual-desktop-chromium', testMatch: REWIND_VISUAL_SPECS, use: { ...devices['Desktop Chrome'], ...rewindDesktop } },
    { name: 'rewind-visual-desktop-webkit', testMatch: REWIND_VISUAL_SPECS, use: { ...devices['Desktop Safari'], ...rewindDesktop } },
    { name: 'rewind-a11y-chromium', testMatch: REWIND_A11Y_SPECS, use: { ...devices['Desktop Chrome'], ...rewindPhoneViewport } },
    { name: 'rewind-a11y-webkit', testMatch: REWIND_A11Y_SPECS, use: { ...devices['Desktop Safari'], ...rewindPhoneViewport } },
    {
      name: 'rewind-a11y-firefox',
      testMatch: REWIND_A11Y_SPECS,
      grep: /@article/,
      use: { ...devices['Desktop Firefox'], ...rewindPhoneViewport },
    },
    { name: 'rewind-perf', testMatch: REWIND_PERF_SPECS, use: { ...devices['Desktop Chrome'], ...rewindPhoneViewport } },
    { name: 'rewind-e2e-chromium', testMatch: REWIND_E2E_SPECS, use: { ...devices['Desktop Chrome'], ...rewindPhoneViewport } },
    { name: 'rewind-e2e-webkit', testMatch: REWIND_E2E_SPECS, use: { ...devices['Desktop Safari'], ...rewindPhoneViewport } },
    { name: 'rewind-e2e-firefox', testMatch: REWIND_FIREFOX_SPECS, use: { ...devices['Desktop Firefox'], ...rewindPhoneViewport } },
  ],

  /* Run the app before starting the tests */
  webServer: {
    // E2E_PREBUILT=1 skips the build when `npm run build:e2e` already ran
    // with the same NEXT_PUBLIC_APP_URL, as CI does in its own step.
    command: prodServer
      ? `${process.env.E2E_PREBUILT === '1' ? '' : 'npm run build:e2e && '}npx next start -p ${port}`
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
      E2E_TEST_MODE: 'true',
      SKIP_CONNECTION_TESTS: 'true',
      ENABLE_DEV_UI: '1',
      FAST_REFRESH: 'false',
    },
  },
});

