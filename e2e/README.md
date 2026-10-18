# E2E Testing with Playwright

This directory contains end-to-end tests for the Plex Wrapped application using Playwright.

## Table of Contents

- [Overview](#overview)
- [Test Authentication](#test-authentication)
- [Available Fixtures](#available-fixtures)
- [Test Utilities](#test-utilities)
- [Running Tests](#running-tests)
- [Writing New Tests](#writing-new-tests)
- [Best Practices](#best-practices)

## Overview

Our E2E tests use Playwright to test the application in a real browser environment. We have custom fixtures and utilities to make testing authenticated flows easier and more maintainable.

## Test Authentication

### How It Works

The test authentication system uses test tokens that bypass the normal Plex OAuth flow in development/test environments. This allows us to test different user types without requiring actual Plex authentication.

### Test Users

We have two pre-configured test users that match the seeded database:

```typescript
import { TEST_USERS } from './fixtures/auth';

// Admin user
TEST_USERS.ADMIN = {
  id: 'admin-user-id',
  email: 'admin@example.com',
  name: 'Admin User',
  isAdmin: true,
  testToken: 'TEST_ADMIN_TOKEN',
};

// Regular user
TEST_USERS.REGULAR = {
  id: 'regular-user-id',
  email: 'regular@example.com',
  name: 'Regular User',
  isAdmin: false,
  testToken: 'TEST_REGULAR_TOKEN',
};
```

### Security Note

These test tokens only work when `NODE_ENV` is set to `development` or `test`. They are completely disabled in production environments.

## Available Fixtures

### Basic Test Fixtures

Import from `./fixtures/auth` to use authenticated page contexts:

```typescript
import { test, expect } from './fixtures/auth';
```

### Page Fixtures

#### `adminPage`

A browser page authenticated as an admin user with full access to admin pages.

```typescript
test('admin can access settings', async ({ adminPage }) => {
  await adminPage.goto('/admin/settings');
  // Test admin functionality
});
```

#### `regularUserPage`

A browser page authenticated as a regular (non-admin) user.

```typescript
test('regular user cannot access admin pages', async ({ regularUserPage }) => {
  await regularUserPage.goto('/admin');
  // Should see 401 error
});
```

#### `authenticatedPage`

A generic authenticated page (defaults to admin for backward compatibility).

```typescript
test('authenticated user can view home', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/');
  // Test authenticated functionality
});
```

## Test Utilities

We provide several utility functions in `./helpers/test-utils.ts` to make common testing operations easier:

### Navigation

```typescript
import { navigateAndVerify } from './helpers/test-utils';

// Navigate and wait for page to be stable
await navigateAndVerify(page, '/admin/settings');

// With custom selector to wait for
await navigateAndVerify(page, '/admin/users', {
  waitForSelector: '[data-testid="users-list"]',
  timeout: 10000,
});
```

### Access Verification

```typescript
import {
  verifyPageAccessible,
  verifyPageUnauthorized,
  verifyAdminAccess,
  verifyNoAdminAccess,
} from './helpers/test-utils';

// Verify page is accessible (no 401 error)
await verifyPageAccessible(page);

// Verify page shows 401 error
await verifyPageUnauthorized(page);

// Verify user has admin access
await verifyAdminAccess(page);

// Verify user does NOT have admin access
await verifyNoAdminAccess(page);
```

### Form Interactions

```typescript
import { fillForm } from './helpers/test-utils';

// Fill and submit a form
await fillForm(
  page,
  {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  },
  'Submit'
);
```

### Toast/Notification Handling

```typescript
import { waitForToast } from './helpers/test-utils';

// Wait for a toast message to appear
await waitForToast(page, 'Settings saved successfully');

// With regex
await waitForToast(page, /saved|updated/i);
```

### Other Utilities

```typescript
import {
  getTestUser,
  verifyCurrentPage,
  elementExists,
  waitForStablePage,
} from './helpers/test-utils';

// Get test user info
const adminUser = getTestUser('admin');
const regularUser = getTestUser('regular');

// Verify current page URL
await verifyCurrentPage(page, '/admin');
await verifyCurrentPage(page, /\/wrapped\/\d+/);

// Check if element exists without throwing
const hasElement = await elementExists(page, '[data-testid="modal"]');

// Wait for page to be stable
await waitForStablePage(page);
```

## Running Tests

### Prerequisites

The suite deletes users, Rewinds and service configs, so it only runs against a
dedicated test database. Start it and apply the migrations first:

```bash
docker compose up -d db-playwright
DATABASE_URL=$E2E_DATABASE_URL npx prisma migrate deploy
```

1. Set `E2E_DATABASE_URL` in `.env` (see `example.env`):
   `postgresql://postgres:postgres@localhost:5433/plex_manager_test?schema=public`.
   Its database name must end in `_test`. `playwright.config.ts`,
   `createE2EPrismaClient()` and the setup-wizard spec each refuse any other
   database, and the suite never uses `.env`'s `DATABASE_URL`.
   The `migrate deploy` line reads `E2E_DATABASE_URL` from your shell, so export
   it there too. If it is empty, Prisma stops instead of falling back to `.env`.
2. If your `db-playwright` volume was created before the database was renamed,
   create the new database once:
   `docker compose exec db-playwright createdb -U postgres plex_manager_test`.

The test suite will automatically:
- Point `DATABASE_URL` at `E2E_DATABASE_URL` for global setup, the helpers, the specs and the web server
- Seed the database with test users (admin and regular user)
- Start its own development server on `E2E_PORT` (default 3100) with `E2E_TEST_MODE=true`
- Create necessary test data

It does not reuse a running `npm run dev`, because that server points at your
development database. Set `E2E_REUSE_SERVER=1` only for a server you started
against `E2E_DATABASE_URL` with `E2E_TEST_MODE=true`.

### Run All Tests

```bash
npm run test:e2e
```

### Run Specific Test File

```bash
npx playwright test admin-functionality.spec.ts
```

### Run Tests in UI Mode

```bash
npx playwright test --ui
```

### Run Tests in Debug Mode

```bash
npx playwright test --debug
```

### Run Tests in Headed Mode

```bash
npx playwright test --headed
```

## Writing New Tests

### Example: Testing Admin Functionality

```typescript
import { test, expect } from './fixtures/auth';
import { navigateAndVerify, verifyPageAccessible } from './helpers/test-utils';

test.describe('My Admin Feature', () => {
  test('admin can access new feature', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/my-feature');
    await verifyPageAccessible(adminPage);

    // Test your feature
    await expect(adminPage.getByRole('heading', { name: 'My Feature' })).toBeVisible();
  });
});
```

### Example: Testing User Permissions

```typescript
import { test, expect } from './fixtures/auth';
import { verifyNoAdminAccess } from './helpers/test-utils';

test.describe('Permission Tests', () => {
  test('regular user cannot access admin feature', async ({ regularUserPage }) => {
    await regularUserPage.goto('/admin/my-feature');

    // Should see 401 error
    await expect(regularUserPage.getByText('401')).toBeVisible();
  });

  test('admin can access feature', async ({ adminPage }) => {
    await adminPage.goto('/admin/my-feature');

    // Should be accessible
    await expect(adminPage.getByRole('heading')).toBeVisible();
  });
});
```

### Example: Testing Both User Types

```typescript
import { test, expect, TEST_USERS } from './fixtures/auth';

test.describe('Cross-User Tests', () => {
  test('different behavior for different users', async ({ adminPage, regularUserPage }) => {
    // Admin sees admin UI
    await adminPage.goto('/admin');
    await expect(adminPage.getByText('Admin Dashboard')).toBeVisible();

    // Regular user sees error
    await regularUserPage.goto('/admin');
    await expect(regularUserPage.getByText('401')).toBeVisible();
  });
});
```

## Best Practices

### 1. Use Appropriate Fixtures

Choose the right fixture for your test:
- Use `adminPage` for testing admin-only features
- Use `regularUserPage` for testing regular user features
- Use both in the same test to verify different behaviors

### 2. Use Helper Utilities

Instead of writing repetitive code, use the provided utilities:

```typescript
// ❌ Don't do this
await page.goto('/admin/settings');
await page.waitForLoadState('networkidle');
const error = page.getByText('401');
await expect(error).not.toBeVisible();

// ✅ Do this
await navigateAndVerify(page, '/admin/settings');
await verifyPageAccessible(page);
```

### 3. Wait for Stability

Always ensure pages are stable before making assertions:

```typescript
test('my test', async ({ adminPage }) => {
  await navigateAndVerify(adminPage, '/admin/my-page');
  // Page is now stable and ready for assertions
  await expect(adminPage.getByRole('heading')).toBeVisible();
});
```

### 4. Test Both Success and Failure Cases

```typescript
test.describe('Feature Tests', () => {
  test('authorized user can access', async ({ adminPage }) => {
    // Test success case
  });

  test('unauthorized user cannot access', async ({ regularUserPage }) => {
    // Test failure case
  });
});
```

### 5. Use Descriptive Test Names

```typescript
// ❌ Bad
test('test 1', async ({ adminPage }) => { /* ... */ });

// ✅ Good
test('admin can update settings and see success message', async ({ adminPage }) => { /* ... */ });
```

### 6. Group Related Tests

```typescript
test.describe('Settings Management', () => {
  test.describe('Admin Access', () => {
    test('can view settings', async ({ adminPage }) => { /* ... */ });
    test('can update settings', async ({ adminPage }) => { /* ... */ });
  });

  test.describe('Regular User Access', () => {
    test('cannot view settings', async ({ regularUserPage }) => { /* ... */ });
  });
});
```

### 7. Clean Up After Tests

If your test creates data, clean it up:

```typescript
test('create and delete item', async ({ adminPage }) => {
  // Create item
  await createTestItem(adminPage);

  // Test with item
  await expect(adminPage.getByText('Test Item')).toBeVisible();

  // Clean up
  await deleteTestItem(adminPage);
});
```

## Troubleshooting

### Tests Timing Out

- Increase timeout for specific operations:
  ```typescript
  await page.waitForSelector('[data-testid="modal"]', { timeout: 10000 });
  ```

### Authentication Issues

If you see errors about Plex API calls failing during tests:

1. **Ensure the database is seeded**: Let the global setup handle it, or run
   `DATABASE_URL=$E2E_DATABASE_URL E2E_TEST_MODE=true npm run db:seed`
2. **Check test users exist**: Verify that `admin@example.com` and `regular@example.com` users exist in the test database
3. **Verify environment**: The test token authentication only works when:
   - `NODE_ENV` is not `'production'`, AND
   - the server has `E2E_TEST_MODE=true` (server side), AND
   - the client bundle has `NEXT_PUBLIC_ENABLE_TEST_AUTH=true` (callback page)

   Playwright's web server sets both flags. `NODE_ENV=test` alone does not enable test login.
4. **Check server restart**: If you're reusing an existing server (`E2E_REUSE_SERVER=1`), make sure it was started with both flags and `DATABASE_URL=$E2E_DATABASE_URL`
5. **Database connection**: Ensure `E2E_DATABASE_URL` is set in `.env` and names a database ending in `_test`

The test authentication bypasses normal Plex OAuth by using special test tokens:
- `TEST_ADMIN_TOKEN` - Authenticates as admin@example.com
- `TEST_REGULAR_TOKEN` - Authenticates as regular@example.com

These tokens are configured in:
- Server-side: `lib/auth.ts` (authorize function)
- Client-side: `app/auth/callback/plex/callback-client.tsx`

### Flaky Tests

- Use `waitForLoadState('networkidle')` before assertions
- Use `navigateAndVerify` instead of plain `goto`
- Avoid hard-coded timeouts, use proper wait conditions

### Can't Find Elements

- Check that the page has loaded: `await page.waitForLoadState('networkidle')`
- Verify element visibility: `await element.isVisible()`
- Use browser dev tools to inspect the page state

## Additional Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)

