import { expect, test } from '../fixtures/auth';

/**
 * The admin Overview (P10.8): `/admin` renders four tiles instead of
 * redirecting, each tile's link opens the page that fixes it, the tiles are
 * reachable by keyboard, and the nav lists Overview first.
 */
const TILES = [
  { id: 'services', url: /\/admin\/(settings|queues)/ },
  { id: 'queues', url: /\/admin\/queues/ },
  { id: 'rewind', url: /\/admin\/rewind$/ },
  { id: 'spend', url: /\/admin\/cost-analysis\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/ },
] as const;

test.describe('Admin Overview', () => {
  test('renders the Overview at /admin with four live tiles', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage).toHaveURL(/\/admin$/);
    await expect(adminPage.getByTestId('admin-overview-header')).toContainText('Overview');
    await expect(adminPage.getByTestId('admin-overview-live-updated')).toContainText(/Updated \d+s ago/);
    for (const { id } of TILES) {
      await expect(adminPage.getByTestId(`admin-overview-${id}`)).toBeVisible();
    }
    await expect(adminPage.getByTestId('admin-nav-overview')).toHaveAttribute('aria-current', 'page');
    await expect(adminPage.getByTestId('admin-nav-users')).not.toHaveAttribute('aria-current');
  });

  for (const { id, url } of TILES) {
    test(`the ${id} tile opens its page`, async ({ adminPage }) => {
      await adminPage.goto('/admin');
      await adminPage.getByTestId(`admin-overview-${id}`).click();
      await expect(adminPage).toHaveURL(url);
    });
  }

  test('the tiles work by keyboard', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    const rewind = adminPage.getByTestId('admin-overview-rewind');
    await expect(rewind).toBeVisible();

    // Tab until the Rewind tile has focus, then follow it with Enter
    await expect(async () => {
      await adminPage.keyboard.press('Tab');
      await expect(rewind).toBeFocused({ timeout: 200 });
    }).toPass({ timeout: 15_000 });
    await adminPage.keyboard.press('Enter');
    await expect(adminPage).toHaveURL(/\/admin\/rewind$/);
  });

  test('the mobile tab bar starts with Overview', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin');
    const tabs = adminPage.getByTestId('admin-tab-bar').getByRole('link');
    await expect(tabs.first()).toHaveAttribute('data-testid', 'admin-tab-overview');
    await expect(adminPage.getByTestId('admin-tab-overview')).toHaveAttribute('aria-current', 'page');
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
