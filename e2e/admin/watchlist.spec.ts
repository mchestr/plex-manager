import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { editSection } from '../helpers/settings';

/**
 * Watchlist sync's own page, under Community: the sidebar reaches it and
 * Settings no longer holds it, its settings card opens read-only with the
 * form behind Edit, and the table lists every member's titles, narrowed on
 * the server by the search and the Status and Type filters in the URL.
 */

const PREFIX = 'e2e-watchlist-';
const ROWS = [
  {
    id: `${PREFIX}severance`,
    userId: TEST_USERS.REGULAR.id,
    plexRatingKey: `${PREFIX}rk-severance`,
    guid: 'plex://show/e2e-severance',
    mediaType: 'TV_SERIES' as const,
    title: 'Watchlist E2E Severance',
    year: 2022,
    status: 'REQUESTED' as const,
    requestedAt: new Date('2026-10-20T12:00:00Z'),
  },
  {
    id: `${PREFIX}arrival`,
    userId: TEST_USERS.ADMIN.id,
    plexRatingKey: `${PREFIX}rk-arrival`,
    guid: 'plex://movie/e2e-arrival',
    mediaType: 'MOVIE' as const,
    title: 'Watchlist E2E Arrival',
    year: 2016,
    status: 'NOT_PERMITTED' as const,
  },
  {
    id: `${PREFIX}heat`,
    userId: TEST_USERS.REGULAR.id,
    plexRatingKey: `${PREFIX}rk-heat`,
    guid: 'plex://movie/e2e-heat',
    mediaType: 'MOVIE' as const,
    title: 'Watchlist E2E Heat',
    year: 1995,
    status: 'SKIPPED_NO_EXTERNAL_ID' as const,
  },
];

const rowOf = (id: string) => `admin-watchlist-row-${PREFIX}${id}`;

test.describe('Admin watchlist sync', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.watchlistSyncHistory.deleteMany({ where: { id: { startsWith: PREFIX } } });
      await prisma.watchlistSyncHistory.createMany({ data: ROWS });
      // Off, as a fresh install starts
      await prisma.config.upsert({ where: { id: 'config' }, create: { id: 'config' }, update: { watchlistSyncEnabled: false } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.watchlistSyncHistory.deleteMany({ where: { id: { startsWith: PREFIX } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('the sidebar reaches it under Community, and Settings no longer holds it', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-stripe-section')).toHaveCount(1);
    await expect(page.getByTestId('settings-watchlist-section')).toHaveCount(0);
    await expect(page.getByTestId('settings-nav-watchlist')).toHaveCount(0);

    const link = page.getByTestId('admin-sidebar').getByTestId('admin-nav-watchlist').first();
    await link.click();
    await expect(page).toHaveURL(/\/admin\/watchlist$/);
    await expect(page.getByTestId('admin-watchlist-header')).toContainText('Watchlist sync');
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('the settings card shows the saved setting, with its form behind Edit', async ({ adminPage: page }) => {
    await page.goto('/admin/watchlist');

    await expect(page.getByTestId('settings-watchlist-summary-enabled')).toContainText('Off');
    await expect(page.getByTestId('settings-watchlist-status')).toContainText('Off');

    await editSection(page, 'watchlist');
    await expect(page.getByTestId('watchlist-sync-global-toggle')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-watchlist-summary')).toBeVisible();
    await expect(page.getByTestId('settings-watchlist-edit')).toBeFocused();
  });

  test("lists every member's titles with their status and member", async ({ adminPage: page }) => {
    await page.goto(`/admin/watchlist?q=${encodeURIComponent('Watchlist E2E')}`);

    const severance = page.getByTestId(rowOf('severance'));
    await expect(severance).toContainText('Watchlist E2E Severance (2022)');
    await expect(severance).toContainText('Requested');
    await expect(severance.getByTestId(`admin-watchlist-member-${PREFIX}severance`)).toHaveAttribute('href', `/admin/users/${TEST_USERS.REGULAR.id}`);
    await expect(page.getByTestId(rowOf('arrival'))).toContainText('Not allowed');
    await expect(page.getByTestId(rowOf('heat'))).toContainText('No TMDB match');
    await expect(page.getByTestId('admin-watchlist-pagination-info')).toHaveText(/Showing all 3 titles/);
  });

  test('searches titles and members, ignoring case', async ({ adminPage: page }) => {
    await page.goto('/admin/watchlist?q=watchlist%20e2e%20HEAT');
    await expect(page.getByTestId(rowOf('heat'))).toBeVisible();
    await expect(page.getByTestId(rowOf('severance'))).toHaveCount(0);

    // A member's name finds their titles
    await page.goto(`/admin/watchlist?q=${encodeURIComponent(TEST_USERS.ADMIN.name)}`);
    await expect(page.getByTestId(rowOf('arrival'))).toBeVisible();
    await expect(page.getByTestId(rowOf('heat'))).toHaveCount(0);
  });

  test('the Status filter lands in the URL with a chip, and Type narrows to films', async ({ adminPage: page }) => {
    await page.goto(`/admin/watchlist?q=${encodeURIComponent('Watchlist E2E')}`);
    await expect(page.getByTestId(rowOf('severance'))).toBeVisible();

    await page.getByTestId('admin-watchlist-filters-filter-status').click();
    await page.getByTestId('admin-watchlist-filters-filter-status-option-notAllowed').click();
    await expect(page).toHaveURL(/status=notAllowed/);
    await expect(page.getByTestId('admin-watchlist-filters-chip-status')).toContainText('Status: Not allowed');
    await expect(page.getByTestId(rowOf('arrival'))).toBeVisible();
    await expect(page.getByTestId(rowOf('severance'))).toHaveCount(0);

    await page.goto(`/admin/watchlist?q=${encodeURIComponent('Watchlist E2E')}&type=movie`);
    await expect(page.getByTestId(rowOf('arrival'))).toBeVisible();
    await expect(page.getByTestId(rowOf('heat'))).toBeVisible();
    await expect(page.getByTestId(rowOf('severance'))).toHaveCount(0);
  });

  test('a search with no match shows the filtered empty state, and Clear filters lists every title', async ({ adminPage: page }) => {
    await page.goto('/admin/watchlist?q=nothing-matches-this');
    await expect(page.getByTestId('admin-watchlist-empty-filtered')).toBeVisible();

    await page.getByTestId('admin-watchlist-clear-filters').click();
    await expect(page).toHaveURL(/\/admin\/watchlist$/);
    await expect(page.getByTestId(rowOf('severance'))).toBeVisible();
  });
});
