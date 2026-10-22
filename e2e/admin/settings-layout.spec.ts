import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * P10.19: the settings layout. The section nav reaches every section, Test
 * all connections re-checks them ("Checked just now"), and at phone width
 * the page does not scroll sideways and Jump to reaches a section.
 */

const SECTIONS = ['plex', 'tautulli', 'overseerr', 'ai', 'discord', 'stripe', 'watchlist', 'rewind', 'other', 'system'];

test.describe('Settings layout', () => {
  test('nav links reach their sections', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-nav')).toBeVisible();

    for (const id of ['stripe', 'system', 'plex']) {
      await page.getByTestId(`settings-nav-${id}`).click();
      await expect(page.getByTestId(`settings-${id}-section`)).toBeInViewport();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
    }
    for (const id of SECTIONS) {
      await expect(page.getByTestId(`settings-${id}-section`)).toHaveCount(1);
    }
  });

  test('every nav glyph is labelled, with the legend below', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');

    const glyph = page.getByTestId('settings-nav-plex').getByRole('img');
    await expect(glyph).toHaveAttribute('aria-label', /Working|Needs attention|Not working|Off, not set up or not checked/);
    await expect(page.getByTestId('settings-nav-legend')).toContainText('Unsaved changes');
  });

  test.describe('with a Tautulli server', () => {
    /**
     * The global and visual seeds have no Tautulli, and a section that is not
     * set up has no "Checked" line. Nothing listens here, so the check fails
     * fast and the badge reads "Can't connect, Checked just now".
     */
    const TAUTULLI = { id: 'settings-layout-e2e-tautulli', name: 'E2E Tautulli', url: 'http://127.0.0.1:9', apiKey: 'e2e-key', isActive: true };

    test.beforeAll(async () => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.tautulli.upsert({ where: { id: TAUTULLI.id }, create: TAUTULLI, update: TAUTULLI });
      } finally {
        await prisma.$disconnect();
      }
    });

    test.afterAll(async () => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.tautulli.deleteMany({ where: { id: TAUTULLI.id } });
      } finally {
        await prisma.$disconnect();
      }
    });

    test('Test all connections turns the badges to "Checked just now"', async ({ adminPage: page }) => {
      await page.goto('/admin/settings');

      await page.getByTestId('settings-test-all').click();

      await expect(page.getByTestId('settings-plex-status')).toContainText('Checked just now');
      await expect(page.getByTestId('settings-tautulli-status')).toContainText('Checked just now');
    });
  });

  test('a dirty section shows its pip in the nav', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');

    await page.getByTestId('settings-overseerr-name').fill('Requests (edited)');

    await expect(page.getByTestId('settings-overseerr-unsaved')).toBeVisible();
    await expect(page.getByTestId('settings-nav-overseerr').getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
    await expect(page.getByTestId('settings-overseerr-save')).toBeEnabled();

    await page.getByTestId('settings-overseerr-discard').click();
    await expect(page.getByTestId('settings-overseerr-save')).toBeDisabled();
  });

  test.describe('at phone width', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('does not scroll sideways, and Jump to reaches Stripe', async ({ adminPage: page }) => {
      await page.goto('/admin/settings');
      await expect(page.getByTestId('settings-jump-to')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBe(390);

      await page.getByTestId('settings-jump-to').click();
      await page.getByTestId('settings-jump-to-option-stripe').click();
      await expect(page.getByTestId('settings-stripe-section')).toBeInViewport();
    });
  });
});
