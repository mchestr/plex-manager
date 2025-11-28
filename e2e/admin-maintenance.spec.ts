import { expect, test } from './fixtures/auth';
import { waitForAdminContent, waitForAdminPageReady } from './helpers/test-utils';

test.describe('Admin Maintenance Feature', () => {
  test.describe('Maintenance Rules', () => {
    test('should access maintenance rules page', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/rules');
      await waitForAdminPageReady(adminPage, 30000);

      // Verify page loaded
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Maintenance Rules' }
      ], { timeout: 30000 });
    });

    test('should navigate to create rule page', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/rules');
      await waitForAdminPageReady(adminPage, 30000);

      // Click create rule button
      await adminPage.getByTestId('maintenance-rules-create').click();

      // Verify we're on the create page
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Create Maintenance Rule' }
      ], { timeout: 30000 });
    });

    test('should display rule creation form', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/rules/new');
      await waitForAdminPageReady(adminPage, 30000);

      // Verify form elements exist
      await expect(adminPage.getByTestId('maintenance-rule-name-input')).toBeVisible();
      await expect(adminPage.getByTestId('maintenance-rule-media-type-select')).toBeVisible();
      await expect(adminPage.getByTestId('maintenance-rule-action-type-select')).toBeVisible();
      await expect(adminPage.getByTestId('maintenance-rule-submit')).toBeVisible();
    });

    test('should show rule builder interface', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/rules/new');
      await waitForAdminPageReady(adminPage, 30000);

      // Verify rule builder elements
      await expect(adminPage.getByTestId('maintenance-rule-add-condition')).toBeVisible();
      await expect(adminPage.getByTestId('maintenance-rule-add-group')).toBeVisible();
      await expect(adminPage.getByTestId('maintenance-rule-operator-toggle')).toBeVisible();
    });
  });

  test.describe('Maintenance Candidates', () => {
    test('should access candidates page', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/candidates');
      await waitForAdminPageReady(adminPage, 30000);

      // Verify page loaded
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Review Candidates' }
      ], { timeout: 30000 });
    });

    test('should display candidate filters', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/candidates');
      await waitForAdminPageReady(adminPage, 30000);

      // Verify filter elements exist
      await expect(adminPage.getByTestId('review-status-filter')).toBeVisible();
      await expect(adminPage.getByTestId('media-type-filter')).toBeVisible();
    });

    test('should show bulk actions structure', async ({ adminPage }) => {
      await adminPage.goto('/admin/maintenance/candidates');
      await waitForAdminPageReady(adminPage, 30000);

      // Note: Bulk actions only appear when candidates are selected.
      // The component returns null when selectedCount === 0, so buttons won't be in DOM.
      // Full workflow testing (selection + actions) requires seeded test data.

      const bulkApprove = adminPage.getByTestId('bulk-approve-button');
      const bulkReject = adminPage.getByTestId('bulk-reject-button');

      // Verify bulk action buttons don't exist when no candidates are selected
      expect(await bulkApprove.count()).toBe(0);
      expect(await bulkReject.count()).toBe(0);
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between maintenance pages', async ({ adminPage }) => {
      // Start at rules page
      await adminPage.goto('/admin/maintenance/rules');
      await waitForAdminPageReady(adminPage, 30000);
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Maintenance Rules' }
      ], { timeout: 30000 });

      // Navigate to candidates
      await adminPage.goto('/admin/maintenance/candidates');
      await waitForAdminPageReady(adminPage, 30000);
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Review Candidates' }
      ], { timeout: 30000 });

      // Navigate to history
      await adminPage.goto('/admin/maintenance/history');
      await waitForAdminPageReady(adminPage, 30000);
      // History page should be accessible
      await expect(adminPage.locator('main')).toBeVisible({ timeout: 15000 });
    });
  });
});
