import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures/test-setup';
import { waitForAdminContent, WAIT_TIMEOUTS } from './helpers/test-utils';

test.describe('Accessibility Tests', () => {
  test.describe('Admin Pages', () => {
    test('admin users page should have no critical accessibility violations', async ({ adminPage }) => {
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Users' }
      ]);

      const accessibilityScanResults = await new AxeBuilder({ page: adminPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Log any violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log('Accessibility violations found:');
        accessibilityScanResults.violations.forEach((violation) => {
          console.log(`- ${violation.id}: ${violation.description}`);
          console.log(`  Impact: ${violation.impact}`);
          console.log(`  Nodes affected: ${violation.nodes.length}`);
        });
      }

      // Only fail on critical or serious issues
      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    });

    test('admin settings page should have no critical accessibility violations', async ({ adminPage }) => {
      await adminPage.locator('aside').getByTestId('admin-nav-settings').first().click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Settings' }
      ]);

      const accessibilityScanResults = await new AxeBuilder({ page: adminPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    });

    test('admin invites page should have no critical accessibility violations', async ({ adminPage }) => {
      await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Invites' }
      ]);

      const accessibilityScanResults = await new AxeBuilder({ page: adminPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    });
  });

  test.describe('Public Pages', () => {
    test('home page should have no critical accessibility violations', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    });

    test('auth page should have no critical accessibility violations', async ({ page }) => {
      await page.goto('/auth/signin');
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);
    });
  });

  test.describe('Modal Accessibility', () => {
    test('confirmation modal should have proper ARIA attributes', async ({ adminPage }) => {
      // Navigate to invites page
      await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Invites' }
      ]);

      // Check if there are any invites to delete
      const deleteButton = adminPage.locator('button[aria-label*="Delete invite"]').first();

      // Only test if there are invites
      const hasInvites = await deleteButton.isVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR }).catch(() => false);

      if (hasInvites) {
        // Click delete button to open confirmation modal
        await deleteButton.click();

        // Wait for modal to appear
        await adminPage.waitForSelector('[role="dialog"]', { timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

        // Verify modal has proper ARIA attributes
        const modal = adminPage.locator('[role="dialog"]');
        await expect(modal).toHaveAttribute('aria-modal', 'true');
        await expect(modal).toHaveAttribute('aria-labelledby');
        await expect(modal).toHaveAttribute('aria-describedby');

        // Run axe on the modal
        const accessibilityScanResults = await new AxeBuilder({ page: adminPage })
          .include('[role="dialog"]')
          .analyze();

        const criticalViolations = accessibilityScanResults.violations.filter(
          (v) => v.impact === 'critical' || v.impact === 'serious'
        );

        expect(criticalViolations).toEqual([]);

        // Close the modal
        await adminPage.keyboard.press('Escape');
      }
    });

    test('create invite modal should have proper ARIA attributes', async ({ adminPage }) => {
      // Navigate to invites page
      await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Invites' }
      ]);

      // Click create invite button
      const createButton = adminPage.getByRole('button', { name: /Generate Invite/i });
      await createButton.click();

      // Wait for modal to appear
      await adminPage.waitForSelector('[role="dialog"]', { timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

      // Verify modal has proper ARIA attributes
      const modal = adminPage.locator('[role="dialog"]');
      await expect(modal).toHaveAttribute('aria-modal', 'true');
      await expect(modal).toHaveAttribute('aria-labelledby', 'create-invite-title');

      // Run axe on the modal
      const accessibilityScanResults = await new AxeBuilder({ page: adminPage })
        .include('[role="dialog"]')
        .analyze();

      const criticalViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );

      expect(criticalViolations).toEqual([]);

      // Close the modal
      await adminPage.keyboard.press('Escape');
    });
  });

  test.describe('Interactive Elements', () => {
    test('icon buttons should have accessible names', async ({ adminPage }) => {
      await waitForAdminContent(adminPage, [
        { type: 'heading', value: 'Users' }
      ]);

      // Check that all buttons have accessible names
      const buttons = adminPage.locator('button');
      const buttonCount = await buttons.count();

      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const isVisible = await button.isVisible();
        if (!isVisible) continue;

        // Each button should have either:
        // - Text content
        // - aria-label
        // - aria-labelledby
        const hasText = await button.textContent().then(text => text?.trim().length ?? 0 > 0);
        const hasAriaLabel = await button.getAttribute('aria-label').then(attr => !!attr);
        const hasAriaLabelledBy = await button.getAttribute('aria-labelledby').then(attr => !!attr);

        if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
          // Get more info about the button for debugging
          const html = await button.innerHTML();
          console.warn(`Button without accessible name found. Inner HTML: ${html.substring(0, 100)}`);
        }
      }

      // Run axe specifically for button accessibility
      const accessibilityScanResults = await new AxeBuilder({ page: adminPage })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      // Check for button-name violations
      const buttonNameViolations = accessibilityScanResults.violations.filter(
        (v) => v.id === 'button-name'
      );

      expect(buttonNameViolations).toEqual([]);
    });
  });
});
