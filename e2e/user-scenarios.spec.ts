import { expect, test } from './fixtures/auth';
import {
  verifyNoAdminAccess
} from './helpers/test-utils';

test.describe('User Scenarios', () => {
  test.describe('Authentication & Authorization', () => {
    test('both user types can authenticate successfully', async ({ adminPage, regularUserPage }) => {
      // Admin page should be on home after auth
      await adminPage.goto('/');
      await expect(adminPage).toHaveURL(/\/$/);

      // Regular user page should also be on home after auth
      await regularUserPage.goto('/');
      await expect(regularUserPage).toHaveURL(/\/$/);
    });
  });

  test.describe('Session Persistence', () => {

    test('regular user session persists across navigation', async ({ regularUserPage }) => {
      // Navigate to home
      await regularUserPage.goto('/');

      // Navigate to wrapped
      await regularUserPage.goto('/wrapped');

      // Navigate back to home - should still be authenticated
      await regularUserPage.goto('/');

      // Still should not have admin access
      await verifyNoAdminAccess(regularUserPage);
    });
  });

  test.describe('Regular User Wrapped Experience', () => {
    test('regular user can access their wrapped content', async ({ regularUserPage }) => {
      // Navigate to wrapped page
      await regularUserPage.goto('/wrapped');
      await regularUserPage.waitForLoadState('networkidle');

      // Page should load (even if no wrapped data exists yet)
      // We just verify no 401 error
      const unauthorizedError = regularUserPage.getByText('401', { exact: true });
      await expect(unauthorizedError).not.toBeVisible();
    });
  });
});

