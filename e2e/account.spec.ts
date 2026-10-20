import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The account page and the Discord link flash (P6.11): the time zone and the
 * Rewind ready switch persist across a reload, a Discord result code shows its
 * toast on /discord/link and leaves the URL, and the account menu reaches
 * /account.
 */

const MEMBER_ID = TEST_USERS.REGULAR.id;

async function resetAccount() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.user.update({ where: { id: MEMBER_ID }, data: { timezone: null } });
    await prisma.rewindPrefs.deleteMany({ where: { userId: MEMBER_ID } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Account page', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(resetAccount);
  test.afterAll(resetAccount);

  test('a saved time zone persists after a reload', async ({ regularUserPage: page }) => {
    await page.goto('/account');
    const trigger = page.getByTestId('account-timezone-trigger');
    await expect(trigger).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await trigger.click();
    await page.getByTestId('account-timezone-option-Pacific/Auckland').click();
    await expect(page.getByTestId('account-timezone-unsaved')).toBeVisible();
    await page.getByTestId('account-timezone-save').click();
    await expect(page.getByTestId('account-timezone-unsaved')).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('account-timezone-trigger')).toHaveText(/Pacific\/Auckland/, {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
    await expect(page.getByTestId('account-timezone-unsaved')).toBeHidden();
  });

  test('the notify switch persists after a reload', async ({ regularUserPage: page }) => {
    await page.goto('/account');
    const toggle = page.getByTestId('account-notify-switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).not.toHaveAttribute('aria-busy', 'true');

    await page.reload();
    await expect(page.getByTestId('account-notify-switch')).toHaveAttribute('aria-checked', 'false', {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
  });

  test('the account menu reaches /account', async ({ regularUserPage: page }) => {
    await page.goto('/');
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-menu-settings').click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('account-notifications')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });
});

test.describe('Discord link flash', () => {
  test('a result code shows its toast on /discord/link and leaves the URL', async ({ regularUserPage: page }) => {
    await page.goto('/discord/link?flash=discord_linked');

    await expect(page.getByTestId('toast')).toContainText('Discord linked', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page).toHaveURL(/\/discord\/link$/);
  });
});
