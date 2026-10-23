/**
 * Setup wizard E2E (P11.32, P10.25), on the guarded test database.
 *
 * CI cannot reach plex.tv, so the Plex step uses the token fallback, and
 * SKIP_CONNECTION_TESTS (set by playwright.config.ts) makes every connection
 * test pass without a request. The claim uses SETUP_TOKEN.
 */

import { expect, test, type Page } from '@playwright/test';
import { assertTestDatabaseUrl } from '../lib/security/test-mode';
import globalSetup from './global-setup';
import { createE2EPrismaClient } from './helpers/prisma';
import { claimSetup, setupToken } from './helpers/setup-claim';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

import type { PrismaClient } from '../lib/generated/prisma/client';

const OPTIONAL_STEPS = ['overseerr', 'sonarr', 'radarr', 'llm-rewind', 'llm-chat', 'discord', 'prometheus'] as const;

/** Waits for a step's card, by its step id. */
async function atStep(page: Page, stepId: string) {
  await expect(page.getByTestId(`setup-step-${stepId}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
}

test.describe('Setup Wizard', () => {
  test.describe.configure({ mode: 'serial' });
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    // This spec wipes every user and service config below: check the target
    // again here so the deleteMany block can never run against a real database.
    assertTestDatabaseUrl(process.env.DATABASE_URL);
    prisma = createE2EPrismaClient();
  });

  test.afterAll(async () => {
    // Restore the global E2E seed state (admin/regular users, setup completion, etc.)
    // so that other specs can rely on consistent fixtures after this destructive test.
    await globalSetup();
    await prisma.$disconnect();
  });

  test('claims the server before the wizard opens (P11.32)', async ({ page, browser }) => {
    // A fresh install: no wizard row, so no claim
    await prisma.setup.deleteMany();

    await navigateAndVerify(page, '/setup');
    await expect(page.getByTestId('setup-claim-form')).toBeVisible();
    await expect(page.getByTestId('setup-wizard')).toHaveCount(0);

    // A wrong code is refused
    await page.getByTestId('setup-claim-code-input').fill('K7QM-4WZD-P2HX');
    await page.getByTestId('setup-claim-submit').click();
    await expect(page.getByTestId('setup-claim-error')).toBeVisible();

    // SETUP_TOKEN claims it, and the wizard renders
    await page.getByTestId('setup-claim-code-input').fill(setupToken());
    await page.getByTestId('setup-claim-submit').click();
    await expect(page.getByTestId('setup-wizard')).toBeVisible();

    // Another browser, without the cookie, still sees the claim form
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto('/setup');
      await expect(otherPage.getByTestId('setup-claim-form')).toBeVisible();
      await expect(otherPage.getByTestId('setup-wizard')).toHaveCount(0);
    } finally {
      await other.close();
    }
  });

  test('token fallback, Tautulli, skips to the summary, Back and save again, then Open admin', async ({ page }) => {
    test.setTimeout(120000);

    // Clear all setup-related data to start fresh
    await prisma.lLMUsage.deleteMany();
    await prisma.wrappedShareVisit.deleteMany();
    await prisma.plexWrapped.deleteMany();
    await prisma.inviteUsage.deleteMany();
    await prisma.invite.deleteMany();
    await prisma.user.deleteMany();
    await prisma.lLMProvider.deleteMany();
    await prisma.discordIntegration.deleteMany();
    await prisma.prometheus.deleteMany();
    await prisma.radarr.deleteMany();
    await prisma.sonarr.deleteMany();
    await prisma.overseerr.deleteMany();
    await prisma.tautulli.deleteMany();
    await prisma.plexServer.deleteMany();
    await prisma.setup.deleteMany();

    await claimSetup(page);
    await navigateAndVerify(page, '/setup');
    await waitForLoadingGone(page);

    // Step 1: Plex, through "Enter a token instead"
    await atStep(page, 'plex');
    await page.getByTestId('setup-plex-token-disclosure').locator('summary').click();
    await page.getByTestId('setup-plex-name').fill('Test Plex Server');
    await page.getByTestId('setup-plex-url').fill('http://localhost:32400');
    await page.getByTestId('setup-plex-secret').fill('test-plex-token-12345');
    await page.getByTestId('setup-form-submit').click();

    // Step 2: Tautulli
    await atStep(page, 'tautulli');
    await page.getByTestId('setup-tautulli-name').fill('Test Tautulli');
    await page.getByTestId('setup-tautulli-url').fill('http://localhost:8181');
    await page.getByTestId('setup-tautulli-secret').fill('test-tautulli-api-key');
    await page.getByTestId('setup-form-submit').click();

    // Skip for now on every optional step, Overseerr to Prometheus
    for (const stepId of OPTIONAL_STEPS) {
      await atStep(page, stepId);
      await page.getByTestId('setup-skip-step').click();
    }

    // The summary lists what is connected and what was skipped
    await atStep(page, 'summary');
    await expect(page.getByTestId('setup-summary-connected')).toContainText('Plex server');
    await expect(page.getByTestId('setup-summary-connected')).toContainText('Tautulli');
    for (const title of ['Overseerr', 'Sonarr', 'Radarr', 'Rewind writer', 'Admin assistant', 'Discord', 'Prometheus']) {
      await expect(page.getByTestId('setup-summary-skipped')).toContainText(title);
    }
    expect(await prisma.overseerr.count()).toBe(0);

    // Back to Tautulli: the key shows as saved, and saving again keeps one active row
    await page.getByTestId('stepper-step-tautulli').first().click();
    await atStep(page, 'tautulli');
    await expect(page.getByTestId('setup-tautulli-secret-saved')).toBeVisible();
    await page.getByTestId('setup-form-submit').click();
    await atStep(page, 'overseerr');
    expect(await prisma.tautulli.count({ where: { isActive: true } })).toBe(1);

    // Open admin finishes setup, then signs in with Plex (plex.tv is stubbed: CI cannot reach it)
    await page.route('https://app.plex.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>plex.tv</p>' }));
    await page.goto('/setup?step=summary');
    await atStep(page, 'summary');
    await page.getByTestId('setup-open-admin').click();
    await page.waitForURL(/app\.plex\.tv/, { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

    const setup = await prisma.setup.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(setup?.isComplete).toBe(true);
    expect(setup?.claimId).toBeNull();
    expect((await prisma.plexServer.findFirst({ where: { isActive: true } }))?.name).toBe('Test Plex Server');
  });

  test('at 390px the first input sits inside the first viewport', async ({ page }) => {
    await prisma.setup.deleteMany();
    await prisma.setup.create({ data: { isComplete: false, currentStepId: 'tautulli' } });
    await page.setViewportSize({ width: 390, height: 844 });

    await claimSetup(page);
    await page.goto('/setup?step=tautulli');
    await atStep(page, 'tautulli');
    await expect(page.getByTestId('setup-stepper-compact')).toContainText('Step 2 of 9, Tautulli');

    const box = await page.getByTestId('setup-tautulli-name').boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  });
});
