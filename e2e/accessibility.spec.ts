import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { TEST_USERS } from './fixtures/auth';
import { ALL_ROUTE_NAMES, A11Y_ROUTES, routeName, routeUserId } from './a11y/routes';
import { readBaseline, staleRoutes, UPDATE_COMMAND, writeBaseline } from './a11y/baseline';
import { analyzeAtRest, scanAgainstBaseline } from './a11y/scan';
import { clearA11yFixtures, seedA11yFixtures } from './a11y/seed';
import { SEEDED_LOCALE, VISUAL_INVITE_IDS, VISUAL_INVITES } from './helpers/seed-fixtures';
import { resetStripeState, setStripeEnabled } from './helpers/stripe';
import { expect, settlePage, test } from './visual/visual-test';

/**
 * axe at WCAG 2.2 AA plus best-practice on every route in `e2e/a11y/routes.ts`
 * (P1.7). Today's violations are a burn-down baseline in
 * `e2e/a11y/axe-baseline.json`: any rise fails, and so does any drop until
 * the baseline is lowered (see `e2e/a11y/baseline.ts`). `/setup` is scanned
 * in `accessibility-setup.spec.ts`.
 *
 * Pages are scanned at rest: seeded `Math.random`, a paused fake clock and
 * reduced motion (`e2e/helpers/deterministic.ts`), over the shared seed.
 */

const updating = process.env.UPDATE_AXE_BASELINE === '1';

test.describe('Accessibility', () => {
  test.beforeAll(async () => {
    await seedA11yFixtures();
  });

  test.afterAll(async () => {
    await clearA11yFixtures();
  });

  test.describe('axe baseline', () => {
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
          if (route.setup) {
            await route.setup(page);
            await settlePage(page);
          }
          await scanAgainstBaseline(page, routeName(route));
        } finally {
          if (route.stripe) await resetStripeState([TEST_USERS.REGULAR.id]);
        }
      });
    }

    test('the baseline lists only routes in the table', () => {
      const baseline = readBaseline();
      const stale = staleRoutes(baseline, ALL_ROUTE_NAMES);
      if (updating && stale.length > 0) {
        for (const route of stale) delete baseline[route];
        writeBaseline(baseline);
        return;
      }
      expect(stale, `Remove these with:\n  ${UPDATE_COMMAND}`).toEqual([]);
    });
  });

  test.describe('Modal ARIA', () => {
    /**
     * Base UI makes a dialog modal by hiding the rest of the page with
     * `aria-hidden`, not with `aria-modal`, so popups portalled out of the
     * dialog stay reachable (P3.6).
     */
    async function expectPageBehindHidden(page: Page) {
      const hidden = await page
        .getByTestId('generate-invite-button')
        .evaluate((el) => el.closest('[aria-hidden="true"]') !== null);
      expect(hidden).toBe(true);
    }

    test.beforeEach(async ({ page, signIn }) => {
      await signIn(TEST_USERS.ADMIN.id);
      await page.goto('/admin/invites');
      await settlePage(page);
    });

    test('the delete-invite confirmation is a labelled, described modal', async ({ page }) => {
      await page.getByTestId(`admin-invites-actions-${VISUAL_INVITE_IDS.valid}`).click();
      // A Base UI popup mounts on an animation frame, and the clock is paused.
      await page.clock.runFor(100);
      await page.getByTestId(`admin-invites-actions-${VISUAL_INVITE_IDS.valid}-delete`).click();
      const dialog = page.getByTestId('admin-invites-delete-dialog');
      await expect(dialog).toBeVisible();
      // A confirmation asks for a decision, so it is an alertdialog (P3.6).
      await expect(dialog).toHaveAttribute('role', 'alertdialog');
      await expectPageBehindHidden(page);
      await expect(dialog).toHaveAttribute('aria-labelledby');
      await expect(dialog).toHaveAttribute('aria-describedby');
      await expect(dialog).toHaveAccessibleName(`Delete invite ${VISUAL_INVITES.valid}?`);
      await expect(dialog).toHaveAccessibleDescription(/can't undo this/);
      await page.keyboard.press('Escape');
      // The paused clock holds Base UI's exit transition until it runs.
      await settlePage(page);
      await expect(dialog).toBeHidden();
    });

    test('the create-invite dialog is a labelled modal', async ({ page }) => {
      await page.getByTestId('generate-invite-button').click();
      const dialog = page.getByTestId('admin-invites-create-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('role', 'dialog');
      await expectPageBehindHidden(page);
      await expect(dialog).toHaveAccessibleName('Create invite');
      await page.keyboard.press('Escape');
      // The paused clock holds Base UI's exit transition until it runs.
      await settlePage(page);
      await expect(dialog).toBeHidden();
    });
  });

  test('<html lang> is the seeded Config.locale, and axe accepts it (P11.17)', async ({ page }) => {
    await page.goto('/');
    await settlePage(page);
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', SEEDED_LOCALE);

    const builder = new AxeBuilder({ page }).withRules(['html-has-lang', 'valid-lang']).exclude('nextjs-portal');
    const results = await analyzeAtRest(page, builder);
    expect(results.violations).toEqual([]);
  });

  test('every button on the users page has an accessible name', async ({ page, signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
    await page.goto('/admin/users');
    await settlePage(page);
    await expect(page.getByTestId('admin-users-header')).toBeVisible();

    const builder = new AxeBuilder({ page }).withRules(['button-name']).exclude('nextjs-portal');
    const results = await analyzeAtRest(page, builder);
    expect(results.violations).toEqual([]);
  });
});
