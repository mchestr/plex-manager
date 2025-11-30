import { expect, test } from './fixtures/auth';
import { verifyPageAccessible, waitForAdminContent, waitForAdminPageReady } from './helpers/test-utils';

test.describe('Admin Observability Page', () => {
  test('should access observability page via navigation', async ({ adminPage }) => {
    // Navigate to observability page using the nav link
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();

    // Wait for page to be ready
    await waitForAdminPageReady(adminPage, 30000);
    await verifyPageAccessible(adminPage);

    // Verify we're on the observability page
    await expect(adminPage).toHaveURL(/\/admin\/observability/);
  });

  test('should display main page elements and heading', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();

    // Wait for page content to load
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'System Overview' },
    ], { timeout: 30000 });

    // Verify page description is present
    await expect(adminPage.getByText(/At-a-glance visibility into system health/i)).toBeVisible();

    // Wait for main content to be visible
    await expect(adminPage.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('should display summary stats cards', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify summary stats cards are present
    await expect(adminPage.getByText('Configured Services')).toBeVisible();
    await expect(adminPage.getByText('Total Users')).toBeVisible();
    await expect(adminPage.getByTestId('stat-card-wrapped-status')).toBeVisible();
    await expect(adminPage.getByText('LLM Usage (24h)')).toBeVisible();
  });

  test('should display service status grid with test IDs', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify service status grid is present
    const serviceStatusGrid = adminPage.getByTestId('service-status-grid');
    await expect(serviceStatusGrid).toBeVisible({ timeout: 15000 });

    // Verify individual service cards are present (checking for at least some key services)
    const plexCard = adminPage.getByTestId('service-status-plex');
    const tautulliCard = adminPage.getByTestId('service-status-tautulli');

    // At least one service card should be visible
    const plexVisible = await plexCard.isVisible().catch(() => false);
    const tautulliVisible = await tautulliCard.isVisible().catch(() => false);

    expect(plexVisible || tautulliVisible).toBeTruthy();
  });

  test('should display activity trend chart section', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify activity trend chart section is present
    await expect(adminPage.getByText('Activity Trend (7 Days)')).toBeVisible();

    // Chart shows either data or "No activity data available" message
    const chartOrEmpty = adminPage.getByTestId('activity-trend-chart').or(
      adminPage.getByText('No activity data available')
    );
    await expect(chartOrEmpty.first()).toBeVisible({ timeout: 15000 });
  });

  test('should display top users section', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify top users section is present
    await expect(adminPage.getByText('Top Users (30 Days)')).toBeVisible();
    await expect(adminPage.getByText('By LLM usage cost')).toBeVisible();

    // Widget shows either users or "No user activity data available" message
    const widgetOrEmpty = adminPage.getByTestId('top-users-widget').or(
      adminPage.getByText('No user activity data available')
    );
    await expect(widgetOrEmpty.first()).toBeVisible({ timeout: 15000 });
  });

  test('should display active sessions section', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify active sessions section is present
    await expect(adminPage.getByText('Active Streams')).toBeVisible();
    await expect(adminPage.getByText('Live Plex sessions')).toBeVisible();

    // Panel shows sessions, empty state, or "not configured" message
    const panelOrMessage = adminPage.getByTestId('active-sessions-panel')
      .or(adminPage.getByText('No active streams'))
      .or(adminPage.getByText('Tautulli not configured'));
    await expect(panelOrMessage.first()).toBeVisible({ timeout: 15000 });
  });

  test('should display download queues section', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify download queue section is present
    await expect(adminPage.getByText('Download Queue')).toBeVisible();
    await expect(adminPage.getByText('Sonarr & Radarr')).toBeVisible();

    // Panel shows queue items, empty state, or "not configured" message
    const panelOrMessage = adminPage.getByTestId('download-queues-panel')
      .or(adminPage.getByText('No items in queue'))
      .or(adminPage.getByText('Neither Sonarr nor Radarr configured'));
    await expect(panelOrMessage.first()).toBeVisible({ timeout: 15000 });
  });

  test('should display storage section', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify storage section is present
    await expect(adminPage.getByText('Storage & Libraries')).toBeVisible();
    await expect(adminPage.getByText('Disk usage and content')).toBeVisible();

    // Panel shows storage data or "not configured" message
    const panelOrMessage = adminPage.getByTestId('storage-panel')
      .or(adminPage.getByText('No services configured for storage metrics'));
    await expect(panelOrMessage.first()).toBeVisible({ timeout: 15000 });
  });

  test('should display requests section', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify media requests section is present
    await expect(adminPage.getByText('Media Requests')).toBeVisible();
    await expect(adminPage.getByText('Overseerr request status')).toBeVisible();

    // Panel shows requests data or "not configured" message
    const panelOrMessage = adminPage.getByTestId('requests-panel')
      .or(adminPage.getByText('Overseerr not configured'));
    await expect(panelOrMessage.first()).toBeVisible({ timeout: 15000 });
  });

  test('should display all quick link cards', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify quick access section header
    await expect(adminPage.getByText('Quick Access')).toBeVisible();

    // Verify all quick link cards are present using their test IDs
    const quickLinks = [
      'quick-link-user-management',
      'quick-link-llm-usage',
      'quick-link-cost-analysis',
      'quick-link-discord-bot',
      'quick-link-library-maintenance',
      'quick-link-settings',
    ];

    for (const testId of quickLinks) {
      const linkCard = adminPage.getByTestId(testId);
      await expect(linkCard).toBeVisible({ timeout: 15000 });
    }
  });

  test('should navigate to user management via quick link', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Click the user management quick link
    const userManagementLink = adminPage.getByTestId('quick-link-user-management');
    await expect(userManagementLink).toBeVisible({ timeout: 15000 });
    await userManagementLink.click();

    // Wait for navigation to complete
    await waitForAdminPageReady(adminPage, 30000);

    // Verify we're on the users page
    await expect(adminPage).toHaveURL(/\/admin\/users/);
    await expect(adminPage.getByRole('heading', { name: /Users/i })).toBeVisible();
  });

  test('should navigate to LLM usage via quick link', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Click the LLM usage quick link
    const llmUsageLink = adminPage.getByTestId('quick-link-llm-usage');
    await expect(llmUsageLink).toBeVisible({ timeout: 15000 });
    await llmUsageLink.click();

    // Wait for navigation to complete
    await waitForAdminPageReady(adminPage, 30000);

    // Verify we're on the LLM usage page
    await expect(adminPage).toHaveURL(/\/admin\/llm-usage/);
    await verifyPageAccessible(adminPage);
  });

  test('should navigate to cost analysis via quick link', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Click the cost analysis quick link
    const costAnalysisLink = adminPage.getByTestId('quick-link-cost-analysis');
    await expect(costAnalysisLink).toBeVisible({ timeout: 15000 });
    await costAnalysisLink.click();

    // Wait for navigation to complete
    await waitForAdminPageReady(adminPage, 30000);

    // Verify we're on the cost analysis page
    await expect(adminPage).toHaveURL(/\/admin\/cost-analysis/);
    await expect(adminPage.getByRole('heading', { name: /Cost Analysis/i })).toBeVisible();
  });

  test('should navigate to settings via quick link', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Click the settings quick link
    const settingsLink = adminPage.getByTestId('quick-link-settings');
    await expect(settingsLink).toBeVisible({ timeout: 15000 });
    await settingsLink.click();

    // Wait for navigation to complete
    await waitForAdminPageReady(adminPage, 30000);

    // Verify we're on the settings page
    await expect(adminPage).toHaveURL(/\/admin\/settings/);
    await expect(adminPage.getByTestId('settings-page-heading')).toBeVisible();
  });

  test('should display secondary stats row with clickable cards', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify secondary stats cards are present
    await expect(adminPage.getByText('Total LLM Cost')).toBeVisible();
    await expect(adminPage.getByText('Maintenance Queue')).toBeVisible();

    // Verify the settings card in secondary stats
    const settingsCards = adminPage.getByText('Settings');
    const count = await settingsCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate back to observability from other admin pages', async ({ adminPage }) => {
    // Start on another admin page
    await adminPage.locator('aside').getByTestId('admin-nav-settings').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify we're on settings
    await expect(adminPage).toHaveURL(/\/admin\/settings/);

    // Navigate back to observability
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify we're back on observability
    await expect(adminPage).toHaveURL(/\/admin\/observability/);
    await expect(adminPage.getByRole('heading', { name: 'System Overview' })).toBeVisible();
  });

  test('should handle page refresh without errors', async ({ adminPage }) => {
    // Navigate to observability page
    await adminPage.locator('aside').getByTestId('admin-nav-observability').first().click();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify initial load
    await expect(adminPage.getByRole('heading', { name: 'System Overview' })).toBeVisible();

    // Reload the page
    await adminPage.reload();
    await waitForAdminPageReady(adminPage, 30000);

    // Verify page still works after reload
    await verifyPageAccessible(adminPage);
    await expect(adminPage.getByRole('heading', { name: 'System Overview' })).toBeVisible();
    await expect(adminPage.getByTestId('service-status-grid')).toBeVisible({ timeout: 15000 });
  });
});
