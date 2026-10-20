import { TEST_USERS } from './fixtures/auth';
import { test as realTimeTest } from './fixtures/session';
import { A11Y_ROUTES, routeUserId } from './a11y/routes';
import { clearA11yFixtures, seedA11yFixtures } from './a11y/seed';
import { resetStripeState, setStripeEnabled } from './helpers/stripe';
import { expect, settlePage, test } from './visual/visual-test';

/**
 * The root layout's contract on every page of the axe route table (P3.2):
 * one `main#main`, a skip link that reaches it, no zoom lock, and IBM Plex
 * Sans on the body. Pages are taken at rest, as the axe spec takes them
 * (`settlePage`).
 */

/** One test per page: the interactive states share their page's layout. */
const routes = A11Y_ROUTES.filter(
  (route, index) => A11Y_ROUTES.findIndex((other) => other.path === route.path && other.as === route.as) === index
);

test.describe('Landmarks and the root layout', () => {
  test.beforeAll(async () => {
    await seedA11yFixtures();
  });

  test.afterAll(async () => {
    await clearA11yFixtures();
  });

  for (const route of routes) {
    test(`${route.as} ${route.path}`, async ({ page, signIn }) => {
      const userId = routeUserId(route);
      if (userId) await signIn(userId);
      if (route.stripe) await setStripeEnabled(true, { configure: true });
      await route.reset?.();
      try {
        await page.goto(route.path);
        await settlePage(page);
        await expect(page.getByTestId(route.ready)).toBeVisible();

        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('main#main')).toHaveCount(1);
        await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
          'content',
          'width=device-width, initial-scale=1'
        );
        expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('plexSans');

        await page.keyboard.press('Tab');
        await expect(page.getByTestId('skip-to-content')).toBeFocused();
        await expect(page.getByTestId('skip-to-content')).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(page.locator('main#main')).toBeFocused();
      } finally {
        if (route.stripe) await resetStripeState([TEST_USERS.REGULAR.id]);
      }
    });
  }
});

/**
 * In real time: the paused clock above holds React's reveal of the streamed
 * page, and the flash waits for the page to finish arriving.
 */
realTimeTest.describe('Flash codes in the URL', () => {
  realTimeTest('a flash code shows its toast and leaves the URL', async ({ page }) => {
    await page.goto('/?flash=discord_linked&keep=1');

    await expect(page.getByTestId('toast')).toContainText('Discord linked');
    await expect(page).toHaveURL(/\/\?keep=1$/);
    // One page, not a second copy beside the streamed one.
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
  });

  realTimeTest('query text that is not a code shows nothing', async ({ page }) => {
    await page.goto('/?error=Your%20account%20is%20locked%2C%20call%20555');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('555');
  });
});
