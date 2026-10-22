import { expect, test } from '../fixtures/auth';

/**
 * The Discord bot page (P10.5): both status rows read on their own, the
 * period header follows the DateRangeFilter, and the page is live.
 */
test.describe('Discord bot page', () => {
  test('shows the linked roles and support bot rows', async ({ adminPage }) => {
    await adminPage.goto('/admin/discord');
    await expect(adminPage.getByTestId('admin-discord-header')).toContainText('Discord bot');
    await expect(adminPage.getByTestId('discord-live-updated')).toContainText(/Updated \d+s ago/);

    for (const id of ['linked-roles', 'support-bot']) {
      await expect(adminPage.getByTestId(`discord-status-${id}-word`)).toHaveText(/^(On|Off|Online|Offline|Needs setup)$/);
    }
    await expect(adminPage.getByTestId('discord-status-linked-roles')).toContainText('Linked roles');
    await expect(adminPage.getByTestId('discord-status-support-bot')).toContainText('Support bot');
  });

  test('a filter change moves the period', async ({ adminPage }) => {
    await adminPage.goto('/admin/discord?from=2026-10-01&to=2026-10-17');
    await expect(adminPage.getByTestId('discord-period')).toHaveText('Period: Oct 1, 2026 – Oct 17, 2026');

    // The streamed filter shows before it hydrates, and a fill before then changes
    // nothing, so fill again until the address follows
    await expect(async () => {
      await adminPage.getByTestId('discord-date-range-from').fill('2026-10-10');
      await expect(adminPage).toHaveURL(/from=2026-10-10/, { timeout: 1000 });
    }).toPass();
    await expect(adminPage.getByTestId('discord-period')).toHaveText('Period: Oct 10, 2026 – Oct 17, 2026');
  });

  test('reads old startDate and endDate bookmarks', async ({ adminPage }) => {
    await adminPage.goto('/admin/discord?startDate=2026-09-01&endDate=2026-09-30');
    await expect(adminPage.getByTestId('discord-period')).toHaveText('Period: Sep 1, 2026 – Sep 30, 2026');
  });
});
