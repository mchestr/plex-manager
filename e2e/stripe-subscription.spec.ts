import type { Browser, BrowserContext } from '@playwright/test';
import { Queue } from 'bullmq';

import { generateMockWrappedData } from '../lib/wrapped/mock-data';
import { expect, test, TEST_USERS } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { JELLYFIN_MEMBERS } from './helpers/jellyfin-members';
import { createE2EPrismaClient } from './helpers/prisma';
import { REWIND_STATISTICS } from './helpers/seed-fixtures';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
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

    // P6.3 (UI-37): the PublicShell on /subscribe always offers a way out.
    test('a gated member can sign out from /subscribe and lands on /', async ({ regularUserPage }) => {
      await setStripeEnabled(true, { configure: true });
      await makeUserGatedNonMember(TEST_USERS.REGULAR.id);

      await regularUserPage.goto('/');
      await regularUserPage.waitForURL(/\/subscribe(?:$|\?|\/)/, {
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });
      const signOut = regularUserPage.getByTestId('public-shell-sign-out');
      await expect(signOut).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      await signOut.click();
      await regularUserPage.waitForURL((url) => url.pathname === '/', {
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });
      await expect(regularUserPage.getByTestId('app-top-bar')).toHaveCount(0);
    });

    // P10.28 (UI-37): one primary plan, and never a raw price id on screen.
    test('a gated member sees one primary plan button and no price ids', async ({ regularUserPage }) => {
      await setStripeEnabled(true, { configure: true });
      await makeUserGatedNonMember(TEST_USERS.REGULAR.id);

      await regularUserPage.goto('/subscribe');
      const page = regularUserPage.getByTestId('subscribe-page');
      await expect(page).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      // The stubbed keys reach no Stripe, so the plans may be unavailable.
      const planList = regularUserPage.getByTestId('subscribe-plan-list');
      if (await planList.isVisible().catch(() => false)) {
        const primaries = planList.getByTestId(/^subscribe-button-/).and(regularUserPage.locator('[data-variant="primary"]'));
        await expect(primaries).toHaveCount(1);
      } else {
        await expect(regularUserPage.getByTestId('subscribe-unavailable')).toBeVisible();
      }
      await expect(page).not.toContainText('price_');
    });

    test('an admin visiting /subscribe is told they already have access', async ({ adminPage }) => {
      await setStripeEnabled(true, { configure: true });

      await adminPage.goto('/subscribe');
      await expect(adminPage.getByTestId('subscribe-already-entitled')).toBeVisible({
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });
      await expect(adminPage.getByTestId('subscribe-plan-list')).toHaveCount(0);
    });

    test('admin is never gated even when Stripe is enabled', async ({ adminPage }) => {
      await setStripeEnabled(true, { configure: true });

      await adminPage.goto('/');
      // Admins bypass the gate (FR-7): they stay in the app, not on /subscribe.
      await expect(adminPage.getByTestId('home-page')).toBeVisible();
      expect(adminPage.url()).not.toContain('/subscribe');
    });
  });

  // P4.5 (SEC-28, FR-51): a canceled member with a completed Rewind keeps the
  // read-only Rewind pages and nothing else, on full loads and on client-side
  // navigation alike. A member of its own, so the seeded users stay members.
  test.describe('Lapsed member (Stripe enabled, canceled, completed Rewind)', () => {
    const memberId = `p45-lapsed-member-${Date.now()}`;
    // The seeded season runs all year, so the season year is this year. The
    // member's Rewind is last year's, so the season year shows "No Wrapped
    // Found" with its in-app link home
    const seasonYear = new Date().getFullYear();
    const rewindYear = seasonYear - 1;
    let context: BrowserContext;

    test.beforeAll(async () => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.user.create({
          data: {
            id: memberId,
            name: 'Lapsed Member',
            email: `${memberId}@example.com`,
            primaryAuthService: 'plex',
            onboardingStatus: { plex: true, jellyfin: false },
            subscription: { create: { status: 'CANCELED', stripeCustomerId: `cus_${memberId}` } },
            plexWrapped: {
              create: {
                year: rewindYear,
                status: 'completed',
                data: JSON.stringify(
                  generateMockWrappedData({
                    promptName: 'Lapsed Member',
                    displayName: 'Lapsed Member',
                    year: rewindYear,
                    userId: memberId,
                    statistics: REWIND_STATISTICS,
                  })
                ),
                generatedAt: new Date(),
              },
            },
          },
        });
      } finally {
        await prisma.$disconnect();
      }
      await setStripeEnabled(true, { configure: true });
    });

    test.beforeEach(async ({ browser, baseURL }: { browser: Browser; baseURL?: string }) => {
      // The claim the jwt callback writes at sign-in, as a canceled member's would be
      context = await browser.newContext();
      await signInAs(context, baseURL!, memberId, { accessLevel: 'lapsed' });
    });

    test.afterEach(async () => {
      await context.close();
    });

    test.afterAll(async () => {
      await resetStripeState();
      const prisma = createE2EPrismaClient();
      try {
        await prisma.user.delete({ where: { id: memberId } });
      } finally {
        await prisma.$disconnect();
      }
    });

    test('opens their stored Rewind, and is sent from / to /subscribe', async () => {
      const page = await context.newPage();

      await page.goto('/rewind');
      await page.waitForURL(new RegExp(`/rewind/${rewindYear}$`), { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      await expect(page.getByTestId('subscribe-page')).toHaveCount(0);

      await page.goto('/');
      await page.waitForURL(/\/subscribe(?:$|\?|\/)/, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      await expect(page.getByTestId('subscribe-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });

    test('is sent to /subscribe when a link on a Rewind page navigates home client-side', async () => {
      const page = await context.newPage();

      // A full load of a Rewind page, then a soft navigation through a Link.
      // proxy.ts redirects the router's RSC request; __tests__/proxy.test.ts
      // covers that rule on its own, since here the (app) layout also renders
      // below the root loading boundary and would redirect too
      await page.goto(`/rewind/${seasonYear}`);
      const home = page.getByTestId('rewind-close');
      await expect(home).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      // Hydrated, so the click is a client-side navigation; the marker proves
      // no full load happened on the way to /subscribe
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => Object.assign(window, { p45SoftNavigation: true }));
      // The router's RSC request for / is answered with the redirect
      const rscHome = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/' && response.request().headers()['rsc'] === '1'
      );
      await home.click();
      expect((await rscHome).status()).toBe(307);

      await page.waitForURL(/\/subscribe(?:$|\?|\/)/, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      await expect(page.getByTestId('subscribe-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      expect(await page.evaluate(() => 'p45SoftNavigation' in window)).toBe(true);
    });
  });

  // P10.22 (UI-37): the plan, its renewal and Manage billing live on /membership.
  test.describe('Membership page (Stripe enabled, active subscriber)', () => {
    test.beforeEach(async () => {
      await setStripeEnabled(true, { configure: true });
      const prisma = createE2EPrismaClient();
      try {
        // No price id, so the page names the plan without asking Stripe
        await prisma.subscription.upsert({
          where: { userId: TEST_USERS.REGULAR.id },
          update: { status: 'ACTIVE', priceId: null, currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000) },
          create: {
            userId: TEST_USERS.REGULAR.id,
            status: 'ACTIVE',
            stripeCustomerId: `cus_p1022_${Date.now()}`,
            currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    test.afterEach(async () => {
      await resetStripeState([TEST_USERS.REGULAR.id]);
    });

    test('shows the plan, Active, the renewal line and Manage billing, with nav entries', async ({
      regularUserPage: page,
    }) => {
      await page.goto('/membership');
      await expect(page.getByTestId('subscription-status-view')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('member-nav-membership')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('subscription-plan')).toHaveText('Membership');
      await expect(page.getByTestId('subscription-status-badge')).toContainText('Active');
      await expect(page.getByTestId('subscription-period')).toContainText(/^Renews /);
      // The Button keeps its hidden loading label in the DOM (aria-hidden) to hold its width.
      await expect(page.getByTestId('manage-subscription-button')).toHaveAccessibleName('Manage billing');
      await expect(page.getByTestId('subscription-status-view')).not.toContainText('price_');

      await page.goto('/');
      await expect(page.getByTestId('home-membership-link')).toHaveAttribute('href', '/membership');
      await expect(page.getByTestId('manage-subscription-button')).toHaveCount(0);
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
      await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-settings').first().click();
      await expect(adminPage.getByTestId('admin-settings-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

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

      // The seeded Jellyfin-only member is not exempt, so turning Stripe on
      // asks first, naming them (P11.11).
      const confirm = adminPage.getByTestId('stripe-enable-jellyfin-confirm');
      if (await confirm.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
        await expect(confirm).toContainText('will be asked to subscribe');
        await adminPage.getByTestId('stripe-enable-jellyfin-confirm-button').click();
      }

      // Enabling succeeds: the switch reflects the on state after the action +
      // refresh complete.
      await expect(toggle).toHaveAttribute('aria-checked', 'true', {
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });
    });

    test('users page shows the subscription column and filter', async ({ adminPage }) => {
      await setStripeEnabled(true, { configure: true });

      await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-users').first().click();
      await expect(adminPage.getByTestId('admin-users-header')).toBeVisible({
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });

      // The subscription-state filter is part of the users list controls.
      await expect(
        adminPage.getByTestId('admin-users-filters-filter-subscription')
      ).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // The Subscription column header is present.
      await expect(adminPage.getByTestId('admin-users-column-subscription')).toBeVisible();
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
      await expect(regularUserPage.getByTestId('home-page')).toBeVisible();

      // Not redirected to the subscribe surface.
      expect(regularUserPage.url()).not.toContain('/subscribe');
      await expect(regularUserPage.getByTestId('subscribe-page')).not.toBeVisible();
    });

    test('no subscribe surfaces appear anywhere in the app when disabled', async ({
      regularUserPage,
    }) => {
      await setStripeEnabled(false);

      await regularUserPage.goto('/');
      await expect(regularUserPage.getByTestId('home-page')).toBeVisible();

      // No subscription banners and no plan list surface.
      await expect(
        regularUserPage.getByTestId('subscription-banners')
      ).not.toBeVisible();
      await expect(
        regularUserPage.getByTestId('subscribe-plan-list')
      ).not.toBeVisible();
    });
  });

  // P11.11: grant and revoke act on the Jellyfin account, against the mock
  // Jellyfin server global setup starts. Stripe is stubbed as above: no secret
  // key, so the jobs skip the live Stripe check, and the spec enqueues the
  // grant and revoke jobs the webhook would enqueue on checkout and on
  // cancellation at period end. The in-process worker runs them.
  test.describe('Jellyfin-only member (P11.11)', () => {
    const SERVER_ID = 'e2e-stripe-jellyfin-mock';
    const [JF_MEMBER] = JELLYFIN_MEMBERS;
    const JELLYFIN_ID = JF_MEMBER.jellyfinUserId;
    let queue: Queue;

    function mockUrl(): string {
      const url = process.env.E2E_JELLYFIN_URL;
      if (!url) throw new Error('E2E_JELLYFIN_URL is unset: e2e/global-setup.ts starts the mock Jellyfin server');
      return url;
    }

    /** The account's `IsDisabled` as the mock stores it. */
    async function isDisabledOnMock(): Promise<unknown> {
      const response = await fetch(`${mockUrl()}/__mock/users/${JELLYFIN_ID}`);
      const user = (await response.json()) as { Policy: { IsDisabled?: unknown } };
      return user.Policy.IsDisabled;
    }

    async function setDisabledOnMock(disabled: boolean): Promise<void> {
      const response = await fetch(`${mockUrl()}/__mock/users/${JELLYFIN_ID}`);
      const user = (await response.json()) as { Policy: Record<string, unknown> };
      await fetch(`${mockUrl()}/Users/${JELLYFIN_ID}/Policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user.Policy, IsDisabled: disabled }),
      });
    }

    test.beforeAll(async () => {
      queue = new Queue('plex-wrapped', { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
      const prisma = createE2EPrismaClient();
      try {
        const row = { name: 'E2E Jellyfin', url: mockUrl(), apiKey: 'e2e-jellyfin-key', isActive: true, enabledForLogin: true };
        await prisma.jellyfinServer.updateMany({ where: { id: { not: SERVER_ID } }, data: { isActive: false } });
        await prisma.jellyfinServer.upsert({ where: { id: SERVER_ID }, create: { id: SERVER_ID, ...row }, update: row });
        await prisma.user.upsert({ where: { id: JF_MEMBER.id }, create: JF_MEMBER, update: { ...JF_MEMBER, isExempt: false } });
        // Stripe on with no secret key: no live Stripe call from the jobs
        await prisma.config.upsert({
          where: { id: 'config' },
          update: { stripeEnabled: true, stripeSecretKey: null },
          create: { id: 'config', stripeEnabled: true },
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    test.afterAll(async () => {
      await setDisabledOnMock(false);
      await queue.close();
      const prisma = createE2EPrismaClient();
      try {
        await prisma.jellyfinServer.deleteMany({ where: { id: SERVER_ID } });
      } finally {
        await prisma.$disconnect();
      }
      await resetStripeState([JF_MEMBER.id]);
    });

    test('subscribing turns the account on, and cancelling turns it off', async ({ browser, baseURL }) => {
      test.skip(!baseURL, 'needs the app URL');
      const prisma = createE2EPrismaClient();
      let context: BrowserContext | undefined;
      try {
        await setDisabledOnMock(true);

        // checkout.session.completed: an ACTIVE row and the grant job
        await prisma.subscription.upsert({
          where: { userId: JF_MEMBER.id },
          create: { userId: JF_MEMBER.id, status: 'ACTIVE' },
          update: { status: 'ACTIVE', stripeSubscriptionId: null, jellyfinAccessStatus: null },
        });
        await queue.add('plex:access:grant', { userId: JF_MEMBER.id }, { jobId: `plex-access-grant-${JF_MEMBER.id}-e2e-${Date.now()}` });
        await expect.poll(isDisabledOnMock, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION }).toBe(false);

        context = await browser.newContext();
        await signInAs(context, baseURL!, JF_MEMBER.id);
        const page = await context.newPage();
        await page.goto('/subscribe/success');
        await expect(page.getByTestId('subscribe-success-jellyfin-enabled')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
        await expect(page.getByTestId('subscribe-success-provisioning')).toHaveCount(0);

        // customer.subscription.deleted at period end: CANCELED and the revoke job
        await prisma.subscription.update({
          where: { userId: JF_MEMBER.id },
          data: { status: 'CANCELED', stripeSubscriptionId: `sub_e2e_jf_${Date.now()}` },
        });
        await queue.add('plex:access:revoke', { userId: JF_MEMBER.id }, { jobId: `plex-access-revoke-${JF_MEMBER.id}-e2e-${Date.now()}` });
        await expect.poll(isDisabledOnMock, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION }).toBe(true);
        await expect
          .poll(async () => (await prisma.subscription.findUnique({ where: { userId: JF_MEMBER.id } }))?.jellyfinAccessStatus)
          .toBe('disabled');
      } finally {
        await context?.close();
        await prisma.$disconnect();
      }
    });
  });
});
