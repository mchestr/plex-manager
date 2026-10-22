import type { Page } from '@playwright/test';
import { axeFor } from './a11y/scan';
import { expect, test, TEST_USERS } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
import { waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

type Service = 'plex' | 'jellyfin';

/**
 * Member onboarding (P10.23, ui-design-system 6.5): five steps (four without
 * a public request URL) with no interstitials. Every Continue moves focus to
 * the new step's h1 at once, and every step passes axe.
 */
async function expectStepReady(page: Page, stepId: string, focused: boolean) {
  const heading = page.getByTestId(`onboarding-${stepId}-heading`);
  await expect(heading).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  if (focused) await expect(heading).toBeFocused();
  await expect(page.getByTestId('onboarding-stepper').locator('[aria-current="step"]')).toHaveCount(1);
  const results = await axeFor(page).analyze();
  expect(results.violations).toEqual([]);
}

async function walkOnboarding(page: Page, service: Service) {
  await expectStepReady(page, 'welcome', false);
  await expect(page.getByTestId('onboarding-wizard-subheading')).toBeVisible();
  await page.getByTestId('onboarding-welcome-continue').click();

  await expectStepReady(page, 'playback', true);
  const guide = page.getByTestId('playback-guide');
  await expect(guide).toContainText(service === 'jellyfin' ? 'Jellyfin' : 'Plex');
  if (service === 'jellyfin') await expect(page.getByTestId('onboarding-step-playback')).not.toContainText('Plex');
  await page.getByTestId('onboarding-playback-continue').click();

  // Requests shows only when the request site has a public URL
  const requests = page.getByTestId('onboarding-requests-heading');
  const support = page.getByTestId('onboarding-support-heading');
  await expect(requests.or(support)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  if (await requests.isVisible()) {
    await expectStepReady(page, 'requests', true);
    await page.getByTestId('onboarding-requests-continue').click();
  }

  await expectStepReady(page, 'support', true);
  await page.getByTestId('onboarding-support-continue').click();

  await expectStepReady(page, 'final', true);
  await expect(page.getByTestId('onboarding-help-note')).toBeVisible();
  await page.getByTestId('onboarding-final-complete').click();
}

const JELLYFIN_SERVER_ID = 'e2e-onboarding-jellyfin';

/**
 * The member's service follows their linked accounts (`lib/members/service.ts`),
 * so the Jellyfin case links a Jellyfin account, records Jellyfin as the one
 * they joined with and adds an active Jellyfin server, whose name onboarding
 * shows (P11.10: each spec that needs Jellyfin adds its own row). The Plex
 * case undoes all three.
 */
async function setOnboarding(service: Service, done: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    if (service === 'jellyfin') {
      const row = {
        name: 'E2E Jellyfin',
        url: process.env.E2E_JELLYFIN_URL ?? 'http://127.0.0.1:8096',
        apiKey: 'e2e-jellyfin-key',
        isActive: true,
        enabledForLogin: false,
      };
      await prisma.jellyfinServer.upsert({
        where: { id: JELLYFIN_SERVER_ID },
        create: { id: JELLYFIN_SERVER_ID, ...row },
        update: row,
      });
    } else {
      await prisma.jellyfinServer.deleteMany({ where: { id: JELLYFIN_SERVER_ID } });
    }
    await prisma.user.update({
      where: { id: TEST_USERS.REGULAR.id },
      data: {
        primaryAuthService: service,
        jellyfinUserId: service === 'jellyfin' ? 'e2e-regular-jellyfin-id' : null,
        onboardingStatus: done ? TEST_USERS.REGULAR.onboardingStatus : { plex: false, jellyfin: false },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function onboardingStatus() {
  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { id: TEST_USERS.REGULAR.id },
      select: { onboardingStatus: true },
    });
    return user?.onboardingStatus as { plex: boolean; jellyfin: boolean } | null;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Onboarding Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    await setOnboarding('plex', true);
  });

  test('a Plex member is sent to onboarding, walks every step and lands home', async ({ browser, baseURL }) => {
    await setOnboarding('plex', false);
    if (!baseURL) throw new Error('This spec needs `use.baseURL` in playwright.config.ts.');
    const context = await browser.newContext();
    await signInAs(context, baseURL, TEST_USERS.REGULAR.id);
    const page = await context.newPage();

    try {
      // Home sends a member who has not finished onboarding to /onboarding
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForURL((url) => url.pathname === '/onboarding', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      await waitForLoadingGone(page);
      await expect(page.getByTestId('onboarding-shell')).toBeVisible();

      await walkOnboarding(page, 'plex');

      await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      expect((await onboardingStatus())?.plex).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('a Jellyfin member sees Jellyfin instructions only', async ({ browser, baseURL }) => {
    await setOnboarding('jellyfin', false);
    if (!baseURL) throw new Error('This spec needs `use.baseURL` in playwright.config.ts.');
    const context = await browser.newContext();
    await signInAs(context, baseURL, TEST_USERS.REGULAR.id);
    const page = await context.newPage();

    try {
      await page.goto('/onboarding', { waitUntil: 'load' });
      await waitForLoadingGone(page);

      await walkOnboarding(page, 'jellyfin');

      await page.waitForURL((url) => url.pathname !== '/onboarding', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      expect((await onboardingStatus())?.jellyfin).toBe(true);
    } finally {
      await context.close();
    }
  });
});
