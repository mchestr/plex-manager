import { Page, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';


/**
 * Navigate to a page and verify it loaded successfully
 */
export async function navigateAndVerify(
  page: Page,
  path: string,
  options?: { waitForSelector?: string; timeout?: number }
): Promise<void> {
  const timeout = options?.timeout || 15000;

  // Wait for network idle to ensure all initial requests complete
  await page.goto(path, { waitUntil: 'networkidle', timeout });

  // Wait for both load states to ensure page is ready
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.waitForLoadState('networkidle', { timeout });

  // Wait for any application loading states to resolve
  await waitForLoadingGone(page, timeout);

  // Wait for the main content area to be present (ensures layout is rendered)
  await page.waitForSelector('main', { state: 'attached', timeout }).catch(() => {
    // Ignore if main doesn't exist, some pages might not have it
  });

  // Wait for React hydration and content painting
  await page.waitForTimeout(2000);

  // Ensure document is ready and content is painted
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        // Give browser time to paint
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      } else {
        window.addEventListener('load', () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      }
    });
  });

  if (options?.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, { timeout, state: 'visible' });
  }
}

/**
 * Wait for application loading screens to disappear
 */
export async function waitForLoadingGone(page: Page, timeout = 15000): Promise<void> {
  // Common loading messages
  const loadingMessages = [
    'Loading...',
    'Checking setup status...',
    'Checking account status...',
    'Loading Plex Manager...',
    'Validating invite...',
    'Loading data...',
    'Fetching...',
  ];

  // Wait a bit for any loading states to appear
  await page.waitForTimeout(500);

  for (const msg of loadingMessages) {
    const loader = page.getByText(msg, { exact: false });
    if (await loader.isVisible().catch(() => false)) {
      await expect(loader).not.toBeVisible({ timeout });
    }
  }

  // Also wait for any loading spinners or skeleton screens
  const spinners = page.locator('[role="status"]').or(page.locator('.animate-spin'));
  const hasSpinners = await spinners.count().then(count => count > 0).catch(() => false);
  if (hasSpinners) {
    await expect(spinners.first()).not.toBeVisible({ timeout }).catch(() => {
      // Ignore if spinner disappears too quickly
    });
  }
}

/**
 * Verify that a page is accessible (not showing 401 error)
 */
export async function verifyPageAccessible(page: Page): Promise<void> {
  await waitForLoadingGone(page);

  const unauthorizedError = page.getByText('401', { exact: true });
  const accessDeniedError = page.getByText('Access Denied');

  await expect(unauthorizedError).not.toBeVisible();
  await expect(accessDeniedError).not.toBeVisible();
}

/**
 * Verify that a page shows unauthorized error
 * Can show either "401" (for unauthenticated) or "Access Denied" (for authenticated non-admin users)
 */
export async function verifyPageUnauthorized(page: Page): Promise<void> {
  await waitForLoadingGone(page);

  // Check for either 401 error (unauthenticated) or Access Denied (authenticated non-admin)
  const unauthorizedError = page.getByText('401', { exact: true });
  const accessDeniedError = page.getByText('Access Denied');

  // At least one should be visible
  const is401Visible = await unauthorizedError.isVisible().catch(() => false);
  const isAccessDeniedVisible = await accessDeniedError.isVisible().catch(() => false);

  if (!is401Visible && !isAccessDeniedVisible) {
    throw new Error('Expected to see either "401" or "Access Denied" error, but neither was found');
  }
}

/**
 * Wait for navigation to complete and page to be stable
 */
export async function waitForStablePage(page: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout || 15000;
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.waitForLoadState('networkidle', { timeout });
  await waitForLoadingGone(page, timeout);

  // Wait for the main content area to be present
  await page.waitForSelector('main', { state: 'attached', timeout }).catch(() => {
    // Ignore if main doesn't exist
  });

  // Extra time for React hydration and painting
  await page.waitForTimeout(1500);

  // Ensure document is fully ready and content is painted
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      } else {
        window.addEventListener('load', () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      }
    });
  });
}

/**
 * Wait for admin page to be fully loaded with navigation and content
 */
export async function waitForAdminPageReady(page: Page, timeout = 15000): Promise<void> {
  // Wait for stable page state
  await waitForStablePage(page, { timeout });

  // Wait for admin nav to be visible (indicates layout is rendered)
  await page.waitForSelector('nav', { state: 'visible', timeout }).catch(() => {
    // Some admin pages might not have nav visible yet
  });

  // Wait for main content to be visible
  await page.waitForSelector('main', { state: 'visible', timeout });

  // Additional time for client components to hydrate and render
  await page.waitForTimeout(1000);
}

/**
 * Verify admin access by checking admin menu items or admin-specific content
 */
export async function verifyAdminAccess(page: Page): Promise<void> {
  // Navigate to admin page
  await page.goto('/admin/users', { waitUntil: 'networkidle' });
  await waitForAdminPageReady(page);

  // Should not see 401 error
  await verifyPageAccessible(page);

  // Should see admin content (heading with Dashboard or Users)
  const adminHeading = page.getByRole('heading', { name: /Dashboard|Users/i });
  await expect(adminHeading).toBeVisible();
}

/**
 * Verify regular user (non-admin) cannot access admin pages
 */
export async function verifyNoAdminAccess(page: Page): Promise<void> {
  // Try to navigate to admin page
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  await waitForLoadingGone(page);

  // Should see 401 error or be redirected
  const url = page.url();
  if (url.includes('/admin')) {
    // Still on admin page, should see 401
    await verifyPageUnauthorized(page);
  } else {
    // Redirected away from admin page
    expect(url).not.toContain('/admin');
  }
}

/**
 * Fill and submit a form with provided data
 */
export async function fillForm(
  page: Page,
  formData: Record<string, string>,
  submitButtonText: string
): Promise<void> {
  for (const [name, value] of Object.entries(formData)) {
    const input = page.locator(`[name="${name}"]`).or(page.getByLabel(name));
    await input.fill(value);
  }

  const submitButton = page.getByRole('button', { name: submitButtonText });
  await submitButton.click();
}

/**
 * Wait for a toast/notification message to appear
 */
export async function waitForToast(
  page: Page,
  message: string | RegExp,
  options?: { timeout?: number }
): Promise<void> {
  const toast = page.getByText(message);
  await expect(toast).toBeVisible({ timeout: options?.timeout ?? 5000 });
}

/**
 * Get user info for a test user type
 */
export function getTestUser(userType: 'admin' | 'regular') {
  return userType === 'admin' ? TEST_USERS.ADMIN : TEST_USERS.REGULAR;
}

/**
 * Verify that user is on the expected page by checking URL
 */
export async function verifyCurrentPage(page: Page, expectedPath: string | RegExp): Promise<void> {
  if (typeof expectedPath === 'string') {
    expect(page.url()).toContain(expectedPath);
  } else {
    expect(page.url()).toMatch(expectedPath);
  }
}

/**
 * Check if an element exists on the page without throwing an error
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: 1000, state: 'attached' });
    return true;
  } catch {
    return false;
  }
}
