import { expect, test, TEST_USERS } from './fixtures/auth';
import { WAIT_TIMEOUTS, waitForAdminContent } from './helpers/test-utils';
import {
  makeUserGatedNonMember,
  resetStripeState,
  seedStripeConfigDisabled,
  setStripeEnabled,
} from './helpers/stripe';

/**
 * E2E coverage for the Stripe subscription gate and admin visibility.
 *
 * Stripe is stubbed via DB state only — no real Stripe calls, no payment. We
 * assert the gate REDIRECT intent (land on /subscribe) rather than completing a
 * Checkout, and the admin enable + subscription-column visibility, all via
 * stable `data-testid` selectors.
 *
 * State is mutated per-test and restored in afterAll because the suite runs
 * serially (workers: 1); leaking `stripeEnabled=true` would gate other specs.
 */
test.describe('Stripe subscription gate & admin visibility', () => {
  test.afterAll(async () => {
    await resetStripeState([TEST_USERS.REGULAR.id, TEST_USERS.ADMIN.id]);
  });

  test.describe('Gated redirect (Stripe enabled, non-member)', () => {
    test.afterEach(async () => {
      // Reset after each so the authenticated fixture for the next test can
      // land on "/" without being gated.
      await resetStripeState([TEST_USERS.REGULAR.id]);
    });

    test('non-member is redirected to /subscribe when navigating into the app', async ({
      regularUserPage,
    }) => {
      // Enable gating and force the regular user into the non-member state only
      // AFTER the authenticated fixture has established a session on "/".
      await setStripeEnabled(true, { configure: true });
      await makeUserGatedNonMember(TEST_USERS.REGULAR.id);

      // Navigating to a guarded app route redirects to the subscribe page.
      await regularUserPage.goto('/');
      await regularUserPage.waitForURL(/\/subscribe(?:$|\?|\/)/, {
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });

      // The subscribe surface renders (plans list when Stripe resolves prices,
      // otherwise the unavailable notice — both are valid stubbed outcomes).
      await expect(regularUserPage.getByTestId('subscribe-page')).toBeVisible({
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });

      const planList = regularUserPage.getByTestId('subscribe-plan-list');
      const unavailable = regularUserPage.getByTestId('subscribe-unavailable');
      const offeredSomething = await planList
        .isVisible()
        .catch(() => false);
      if (offeredSomething) {
        await expect(planList).toBeVisible();
      } else {
        await expect(unavailable).toBeVisible();
      }
    });

    test('admin is never gated even when Stripe is enabled', async ({ adminPage }) => {
      await setStripeEnabled(true, { configure: true });

      await adminPage.goto('/');
      // Admins bypass the gate (FR-7): they stay in the app, not on /subscribe.
      await adminPage.waitForLoadState('networkidle');
      expect(adminPage.url()).not.toContain('/subscribe');
    });
  });

  test.describe('Admin enable + subscription column', () => {
    test.beforeEach(async () => {
      // Fully configured but disabled: the pre-condition for "enable unlocks".
      await seedStripeConfigDisabled();
    });

    test.afterEach(async () => {
      await resetStripeState([TEST_USERS.ADMIN.id]);
    });

    test('admin can enable Stripe from settings once configured', async ({ adminPage }) => {
      await adminPage.locator('aside').getByTestId('admin-nav-settings').first().click();
      await waitForAdminContent(
        adminPage,
        [{ type: 'heading', value: 'Settings' }],
        { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION }
      );

      // The Stripe settings card and its form are present.
      const form = adminPage.getByTestId('stripe-settings-form');
      await expect(form).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // Configured, so there is no "cannot be enabled" requirements notice and
      // the toggle is interactive.
      await expect(
        adminPage.getByTestId('stripe-enable-requirements')
      ).not.toBeVisible();

      const toggle = adminPage.getByTestId('stripe-enabled-toggle');
      await expect(toggle).toBeEnabled();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await toggle.click();

      // Enabling succeeds: the switch reflects the on state after the action +
      // refresh complete.
      await expect(toggle).toHaveAttribute('aria-checked', 'true', {
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });
    });

    test('users page shows the subscription column and filter', async ({ adminPage }) => {
      await setStripeEnabled(true, { configure: true });

      await adminPage.locator('aside').getByTestId('admin-nav-users').first().click();
      await waitForAdminContent(
        adminPage,
        [{ type: 'heading', value: 'Users' }],
        { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION }
      );

      // The subscription-state filter is part of the users list controls.
      await expect(
        adminPage.getByTestId('users-filter-subscription')
      ).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // The Subscription column header is present.
      await expect(
        adminPage.getByRole('columnheader', { name: 'Subscription' })
      ).toBeVisible();
    });
  });

  test.describe('Disabled behavior (feature off)', () => {
    test.beforeEach(async () => {
      await resetStripeState([TEST_USERS.REGULAR.id]);
    });

    test('no subscribe redirect when disabled: non-member behaves normally', async ({
      regularUserPage,
    }) => {
      // Even as a non-member, with Stripe disabled there is no gating.
      await makeUserGatedNonMember(TEST_USERS.REGULAR.id);
      await setStripeEnabled(false);

      await regularUserPage.goto('/');
      await regularUserPage.waitForLoadState('networkidle');

      // Not redirected to the subscribe surface.
      expect(regularUserPage.url()).not.toContain('/subscribe');
      await expect(regularUserPage.getByTestId('subscribe-page')).not.toBeVisible();
    });

    test('no subscribe surfaces appear anywhere in the app when disabled', async ({
      regularUserPage,
    }) => {
      await setStripeEnabled(false);

      await regularUserPage.goto('/');
      await regularUserPage.waitForLoadState('networkidle');

      // No subscription banners and no plan list surface.
      await expect(
        regularUserPage.getByTestId('subscription-banners')
      ).not.toBeVisible();
      await expect(
        regularUserPage.getByTestId('subscribe-plan-list')
      ).not.toBeVisible();
    });
  });
});
