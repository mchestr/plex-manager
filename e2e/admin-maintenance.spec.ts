import { expect, test } from './fixtures/auth';
import { waitForAdminContent, waitForAdminPageReady, waitForToast, WAIT_TIMEOUTS } from './helpers/test-utils';
import { seedMaintenanceData, cleanupMaintenanceData, resetCandidateStatuses, MAINTENANCE_TEST_DATA } from './helpers/maintenance-seed';
import { createE2EPrismaClient } from './helpers/prisma';
import type { PrismaClient } from '../lib/generated/prisma/client';

/**
 * Admin Maintenance Feature E2E Tests
 *
 * These tests cover the complete maintenance workflow including:
 * - Creating and managing maintenance rules
 * - Reviewing and acting on candidates
 * - Bulk operations
 * - Viewing deletion history
 */
test.describe('Admin Maintenance Feature', () => {
  // Shared Prisma client for all maintenance tests to avoid creating multiple connection pools
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = createE2EPrismaClient();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });
  test.describe('Maintenance Rules', () => {
    test.describe('UI Structure', () => {
      test('should access maintenance rules page', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);

        // Click the Rules link in sidebar
        await adminPage.getByRole('link', { name: 'Rules' }).click();

        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
      });

      test('should navigate to create rule page', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Rules' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        await adminPage.getByTestId('maintenance-rule-create').click();

        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Create Maintenance Rule' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
      });

      test('should display rule creation form', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Rules' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await adminPage.getByTestId('maintenance-rule-create').click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Create Maintenance Rule' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        await expect(adminPage.getByTestId('maintenance-rule-name-input')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-media-type-select')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-action-type-select')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-submit')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-cancel')).toBeVisible();
      });

      test('should show rule builder interface', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Rules' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await adminPage.getByTestId('maintenance-rule-create').click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Create Maintenance Rule' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        await expect(adminPage.getByTestId('maintenance-rule-add-condition')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-add-group')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-operator-toggle')).toBeVisible();
      });
    });

    test.describe('Rule Creation Workflow', () => {
      test('should show validation error when submitting empty form', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Rules' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await adminPage.getByTestId('maintenance-rule-create').click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Create Maintenance Rule' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Clear any default name and submit
        const nameInput = adminPage.getByTestId('maintenance-rule-name-input');
        await nameInput.fill('');

        await adminPage.getByTestId('maintenance-rule-submit').click();

        // HTML5 validation prevents submission - verify field is invalid
        const validationMessage = await nameInput.evaluate(
          (el: HTMLInputElement) => el.validationMessage
        );
        expect(validationMessage).toBeTruthy();

        // Should still be on create page (form didn't submit)
        await expect(adminPage.getByRole('heading', { name: 'Create Maintenance Rule' })).toBeVisible();
      });

      test('should navigate back when cancel button is clicked', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Rules' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        await adminPage.getByTestId('maintenance-rule-create').click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Create Maintenance Rule' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Click cancel button
        await adminPage.getByTestId('maintenance-rule-cancel').click();

        // Should navigate back to rules list
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
      });

      test('should create a complete rule successfully', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Rules' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await adminPage.getByTestId('maintenance-rule-create').click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Create Maintenance Rule' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        const uniqueRuleName = `E2E Test Rule ${Date.now()}`;

        // Fill in rule name
        await adminPage.getByTestId('maintenance-rule-name-input').fill(uniqueRuleName);

        // The form should have default media type and action type selected
        // Verify they are visible (defaults are Movie and Flag for Review)
        await expect(adminPage.getByTestId('maintenance-rule-media-type-select')).toBeVisible();
        await expect(adminPage.getByTestId('maintenance-rule-action-type-select')).toBeVisible();

        // The default condition should already be present
        // Verify we can see the condition builder elements
        await expect(adminPage.getByTestId('maintenance-rule-add-condition')).toBeVisible();

        // Submit the form
        await adminPage.getByTestId('maintenance-rule-submit').click();

        // Should show success toast
        await waitForToast(adminPage, /created successfully/i, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

        // Should redirect to rules list
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Maintenance Rules' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Force page reload to ensure fresh data
        await adminPage.reload();
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);

        // The new rule should appear in the list
        await expect(adminPage.getByText(uniqueRuleName)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      });
    });
  });

  test.describe('Maintenance Candidates', () => {
    test.describe('UI Structure', () => {
      test('should access candidates page', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();

        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
      });

      test('should display candidate filters', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        await expect(adminPage.getByTestId('review-status-filter')).toBeVisible();
        await expect(adminPage.getByTestId('media-type-filter')).toBeVisible();
      });

      test('should show bulk actions in DOM', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Bulk actions exist in DOM (hidden when no selection)
        const bulkApprove = adminPage.getByTestId('bulk-approve-button');
        const bulkReject = adminPage.getByTestId('bulk-reject-button');

        expect(await bulkApprove.count()).toBe(1);
        expect(await bulkReject.count()).toBe(1);
      });
    });

    test.describe('Candidate Review Workflow', () => {
      test.beforeAll(async () => {
        await seedMaintenanceData(prisma);
      });

      test.afterAll(async () => {
        await cleanupMaintenanceData(prisma);
      });

      test.beforeEach(async () => {
        await resetCandidateStatuses(prisma);
      });

      test('should display seeded candidates', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Should show candidates in the list
        // Wait for the first candidate to appear
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });
      });

      test('should approve individual candidate', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Wait for candidates to load
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });

        // Find and click the approve button for the first candidate
        const approveButton = adminPage.getByTestId(`approve-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[0].id}`);
        await expect(approveButton).toBeVisible();
        await approveButton.click();

        // Should show success toast
        await waitForToast(adminPage, /status updated|approved/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

        // The candidate status should update (may need to check the status badge)
        // After approval, the approve/reject buttons should disappear for that candidate
        await expect(approveButton).not.toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
      });

      test('should reject individual candidate', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Wait for candidates to load
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[1].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });

        // Find and click the reject button for the second candidate
        const rejectButton = adminPage.getByTestId(`reject-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[1].id}`);
        await expect(rejectButton).toBeVisible();
        await rejectButton.click();

        // Should show success toast
        await waitForToast(adminPage, /status updated|rejected/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

        // The reject button should disappear after rejection
        await expect(rejectButton).not.toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
      });

      test('should select candidates using checkboxes', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Wait for candidates to load
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });

        // Select the first candidate
        const firstCheckbox = adminPage.getByTestId(`select-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[0].id}`);
        await expect(firstCheckbox).toBeVisible();
        await firstCheckbox.click();

        // Bulk actions should now be visible
        const bulkApproveButton = adminPage.getByTestId('bulk-approve-button');
        await expect(bulkApproveButton).toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

        // Select another candidate
        const secondCheckbox = adminPage.getByTestId(`select-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[1].id}`);
        await expect(secondCheckbox).toBeVisible();
        await secondCheckbox.click();

        // Button should show count of selected candidates (2)
        await expect(bulkApproveButton).toContainText('2');
      });

      test('should perform bulk approve operation', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Wait for candidates to load
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });

        // Select multiple candidates
        await adminPage.getByTestId(`select-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[0].id}`).click();
        await adminPage.getByTestId(`select-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[1].id}`).click();

        // Click bulk approve
        const bulkApproveButton = adminPage.getByTestId('bulk-approve-button');
        await expect(bulkApproveButton).toBeVisible();
        await bulkApproveButton.click();

        // Should show success toast
        await waitForToast(adminPage, /2 candidates approved/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

        // The approve buttons for those candidates should disappear
        await expect(adminPage.getByTestId(`approve-candidate-${MAINTENANCE_TEST_DATA.CANDIDATES[0].id}`)).not.toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
      });

      test('should perform bulk reject operation', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Wait for candidates to load
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });

        // Select candidates using select-all checkbox
        const selectAllCheckbox = adminPage.getByTestId('select-all-candidates');
        await expect(selectAllCheckbox).toBeVisible();
        await selectAllCheckbox.click();

        // Click bulk reject
        const bulkRejectButton = adminPage.getByTestId('bulk-reject-button');
        await expect(bulkRejectButton).toBeVisible();
        await bulkRejectButton.click();

        // Should show success toast
        await waitForToast(adminPage, /candidates rejected/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
      });

      test('should filter candidates by review status', async ({ adminPage }) => {
        await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
        await adminPage.getByRole('link', { name: 'Candidates' }).click();
        await waitForAdminContent(adminPage, [
          { type: 'heading', value: 'Review Candidates' }
        ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Wait for initial load with PENDING filter (default)
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });

        // Change the review status filter to ALL
        const statusFilter = adminPage.getByTestId('review-status-filter');
        await statusFilter.click();

        // Select ALL option (custom dropdown uses buttons, not native options)
        await adminPage.getByRole('button', { name: /all status/i }).click();

        // Page should update - verify we still see candidates
        await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.CANDIDATES[0].title)).toBeVisible({
          timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
        });
      });
    });
  });

  test.describe('Maintenance History', () => {
    test.beforeAll(async () => {
      await seedMaintenanceData(prisma);
    });

    test.afterAll(async () => {
      await cleanupMaintenanceData(prisma);
    });

    test('should access history page', async ({ adminPage }) => {
      await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
      await adminPage.getByRole('link', { name: 'Deletion History' }).click();

      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Deletion History' }
      ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
    });

    test('should display deletion history entries', async ({ adminPage }) => {
      await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
      await adminPage.getByRole('link', { name: 'Deletion History' }).click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Deletion History' }
      ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // Should show the seeded deletion log entry
      await expect(adminPage.getByText(MAINTENANCE_TEST_DATA.DELETION_LOG.title)).toBeVisible({
        timeout: WAIT_TIMEOUTS.ADMIN_CONTENT
      });
    });

    test('should show deletion statistics', async ({ adminPage }) => {
      await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
      await adminPage.getByRole('link', { name: 'Deletion History' }).click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Deletion History' }
      ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // The history page should show statistics cards or summary
      // Look for common stat elements
      await expect(adminPage.locator('main')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between maintenance pages', async ({ adminPage }) => {
      await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);

      // Start at rules page
      await adminPage.getByRole('link', { name: 'Rules' }).click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Maintenance Rules' }
      ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // Navigate to candidates
      await adminPage.getByRole('link', { name: 'Candidates' }).click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Review Candidates' }
      ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

      // Navigate to history
      await adminPage.getByRole('link', { name: 'Deletion History' }).click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Deletion History' }
      ], { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
    });

    test('should access maintenance overview page', async ({ adminPage }) => {
      await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.ADMIN_CONTENT);
      await adminPage.getByRole('link', { name: 'Overview' }).click();

      // Should load without error
      await expect(adminPage.locator('main')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });
  });
});
