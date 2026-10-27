import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { editSection } from '../helpers/settings';

/**
 * P10.19: the settings layout. The section nav reaches every section, Test
 * all connections re-checks them ("Checked just now"), a section being edited
 * marks itself in the nav, and at phone width the page does not scroll
 * sideways and Jump to reaches a section.
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

  test('shows one group at a time, and anchors reveal their group', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-plex-section')).toBeVisible();
    await expect(page.getByTestId('settings-stripe-section')).toBeHidden();

    await page.goto('/admin/settings#rewind');
    await expect(page.getByTestId('settings-rewind-section')).toBeVisible();
    await expect(page.getByTestId('settings-plex-section')).toBeHidden();

    // "Change the server time zone" opens the System section on its time zone field
    await page.getByTestId('rewind-settings-time-zone-link').click();
    await expect(page.getByTestId('settings-system-section')).toBeVisible();
    await expect(page).toHaveURL(/#server-time-zone$/);
    await expect(page.locator('#server-time-zone')).toBeInViewport();
    await expect(page.getByTestId('server-time-zone-select')).toBeFocused();
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

  test('a dirty section shows its pip in the nav, and Cancel asks before discarding', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');

    // The seed has no Overseerr, so the section reads "Not set up." with Set up
    await expect(page.getByTestId('settings-overseerr-empty')).toHaveText('Not set up.');
    await editSection(page, 'overseerr');
    await page.getByTestId('settings-overseerr-name').fill('Requests (edited)');

    await expect(page.getByTestId('settings-overseerr-unsaved')).toBeVisible();
    await expect(page.getByTestId('settings-nav-overseerr').getByRole('img', { name: 'Unsaved changes' })).toBeVisible();

    await page.getByTestId('settings-overseerr-cancel').click();
    await expect(page.getByTestId('settings-overseerr-discard-dialog')).toContainText('Discard changes to Overseerr?');
    await page.getByTestId('settings-overseerr-discard-dialog-confirm').click();

    await expect(page.getByTestId('settings-overseerr-empty')).toBeVisible();
    await expect(page.getByTestId('settings-overseerr-edit')).toBeFocused();
    await expect(page.getByTestId('settings-nav-overseerr').getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0);
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
