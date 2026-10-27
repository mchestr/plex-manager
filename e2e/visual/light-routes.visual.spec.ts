import { TEST_USERS } from '../fixtures/auth';
import { A11Y_ROUTES, routeName, routeUserId } from '../a11y/routes';
import { clearA11yFixtures, seedA11yFixtures } from '../a11y/seed';
import { resetStripeState, setStripeEnabled } from '../helpers/stripe';
import { expect, expectScreen, settlePage, skipUnlessProductionBuild, test } from './visual-test';

/**
 * Every route in the axe route table, in the light theme (P10.10). Only the
 * `visual-light-*` projects run this file: they hold `pm-theme=light`. The
 * member and admin screens of the dark projects run there too, beside these.
 */

skipUnlessProductionBuild();

/** A file-safe screenshot name from the route's baseline key. */
const screenName = (name: string) =>
  `light-${name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}`;

test.describe('Every route in light', () => {
  test.beforeAll(async () => {
    await seedA11yFixtures();
  });

  test.afterAll(async () => {
    await clearA11yFixtures();
  });

  for (const route of A11Y_ROUTES) {
    test(routeName(route), async ({ page, signIn }) => {
      const userId = routeUserId(route);
      if (userId) await signIn(userId);
      if (route.stripe) await setStripeEnabled(true, { configure: true });
      await route.reset?.();
      try {
        await page.goto(route.path);
        await settlePage(page);
        await expect(page.getByTestId(route.ready)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
        if (route.setup) await route.setup(page);
        await expectScreen(page, screenName(routeName(route)));
      } finally {
        if (route.stripe) await resetStripeState([TEST_USERS.REGULAR.id]);
      }
    });
  }
});
