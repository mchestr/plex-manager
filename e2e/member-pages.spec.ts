import { axeFor } from './a11y/scan';
import { expect, test } from './fixtures/auth';
import { resetStripeState } from './helpers/stripe';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The member destinations from P10.22 (ui-design-system 6.1): /announcements,
 * /help and, with Stripe on, /membership. Each lights its nav entry and has no
 * axe violations; /membership is a 404 with Stripe off and no subscription
 * (stripe-subscription.spec.ts covers it with Stripe on).
 */
test.describe('Member pages', () => {
  test.beforeAll(async () => {
    await resetStripeState();
  });

  for (const { path, heading, navId } of [
    { path: '/announcements', heading: 'Announcements', navId: null },
    { path: '/help', heading: 'Help', navId: 'member-nav-help' },
  ] as const) {
    test(`${path} renders its h1, lights its nav entry and passes axe`, async ({ regularUserPage: page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });
      if (navId) await expect(page.getByTestId(navId)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('member-nav-home')).not.toHaveAttribute('aria-current', 'page');

      const results = await axeFor(page).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('Help has the playback and support sections at their anchors', async ({ regularUserPage: page }) => {
    await page.goto('/help#support');
    await expect(page.getByTestId('help-playback')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.locator('section#support')).toBeVisible();
  });

  test('/membership is a 404 with Stripe off and no subscription', async ({ regularUserPage: page }) => {
    const response = await page.goto('/membership');
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('not-found-heading')).toBeVisible();
    await expect(page.getByTestId('member-nav-membership')).toHaveCount(0);
  });
});
