import { expect, test } from './fixtures/session';
import { TEST_USERS } from './fixtures/auth';
import { setLightThemeFlag } from './helpers/light-theme';
import { createE2EPrismaClient } from './helpers/prisma';

/**
 * Checks that only mean something against `next build` plus `next start`
 * (P1.5): `next dev` relaxes the CSP for its own tooling and serves images
 * differently. CI runs every spec in production mode.
 */
test.skip(process.env.E2E_SERVER !== 'prod', 'Runs only against a production build: set E2E_SERVER=prod.');

test.describe('Production build', () => {
  // BP-01, P0.1: the image optimizer never fetches a caller-supplied URL.
  test('/_next/image does not serve an external image', async ({ request }) => {
    const response = await request.get('/_next/image?url=https%3A%2F%2Fexample.com%2Fa.avif&w=64&q=75');

    expect(response.status()).not.toBe(200);
  });

  test("the CSP has no 'unsafe-eval'", async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'];

    expect(csp).toBeTruthy();
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('an admin can open /admin/users', async ({ page, signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
    await page.goto('/admin/users');

    await expect(page.getByTestId('admin-users-header')).toBeVisible();
    await expect(page.getByTestId('admin-nav-users')).toBeVisible();
  });

  // Until P4.3 (BP-27) a production build shows the generic error page rather
  // than the 401 page, so this checks that no admin content renders instead.
  test('a member is refused /admin', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId('admin-nav-users')).toHaveCount(0);
    await expect(page.getByTestId('admin-users-header')).toHaveCount(0);
  });

  // P11.19: the app settings are a 'use cache' entry tagged app-settings. A
  // settings save updates the tag, so the next request reads the new name
  // instead of waiting out the cache. The name is written to Config, then the
  // light-theme Switch (a save that updates the tag) is flipped and restored.
  test('the next request after a settings save shows a new server name', async ({ page, signIn }) => {
    const prisma = createE2EPrismaClient();
    const name = `Cache Check ${Date.now()}`;
    const before = await prisma.config.findUnique({ where: { id: 'config' }, select: { serverName: true, lightThemeEnabled: true } });
    try {
      await signIn(TEST_USERS.ADMIN.id);
      await page.goto('/');
      await prisma.config.upsert({ where: { id: 'config' }, update: { serverName: name }, create: { id: 'config', serverName: name } });

      await setLightThemeFlag(page, !(before?.lightThemeEnabled ?? false));
      await page.goto('/');
      await expect(page).toHaveTitle(new RegExp(`- ${name}$`));
    } finally {
      await prisma.config.updateMany({ where: { id: 'config' }, data: { serverName: before?.serverName ?? null } });
      await setLightThemeFlag(page, before?.lightThemeEnabled ?? false);
      await prisma.$disconnect();
    }
  });
});
