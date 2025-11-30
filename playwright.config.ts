import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT || '3000';
const baseURL = `http://localhost:${port}`;
console.log(`Running tests on ${baseURL}`);
/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true, // Enable parallel test execution within files
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4, // Parallel workers (tests with shared state use serial mode)
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

  /* Configure projects for different test types */
  projects: [
    // Read-only tests can run in parallel (no shared state mutations)
    {
      name: 'readonly',
      testMatch: [
        /accessibility\.spec\.ts/,
        /admin-functionality\.spec\.ts/,
        /admin-observability\.spec\.ts/,
        /admin-protection\.spec\.ts/,
      ],
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests that mutate shared state must run sequentially
    {
      name: 'mutations',
      testMatch: [
        /admin-maintenance\.spec\.ts/,
        /onboarding-flow\.spec\.ts/,
        /public-flows\.spec\.ts/,
        /user-scenarios\.spec\.ts/,
      ],
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
    // Setup wizard runs in complete isolation
    {
      name: 'setup-wizard',
      testMatch: /setup-wizard\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `npx next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000, // 30 seconds to allow for build/startup
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_ENABLE_TEST_AUTH: 'true',
      ENABLE_TEST_AUTH: 'true',
      SKIP_CONNECTION_TESTS: 'true',
      FAST_REFRESH: 'false',
    },
  },
});

