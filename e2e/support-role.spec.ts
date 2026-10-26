import { test as base, expect } from '@playwright/test';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The Support role's scoped admin area (RBAC): a non-admin with
 * `User.role = "support"` gets a trimmed shell with the assistant and the
 * users list, and every other admin page is refused server-side, not just
 * hidden from the navigation.
 */
const SUPPORT_ID = 'e2e-support-user-id';
const CHAT_PROVIDER_ID = 'e2e-support-role-chat';

const test = base.extend<{ supportPage: import('@playwright/test').Page }>({
  supportPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext();
    await signInAs(context, baseURL as string, SUPPORT_ID);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/** Pages an admin opens that a Support user must not. */
const REFUSED_PATHS = [
  '/admin/settings',
  '/admin/invites',
  '/admin/llm-usage',
  '/admin/cost-analysis',
  '/admin/queues',
  '/admin/discord',
  '/admin/rewind',
  '/admin/prompts',
  '/admin/shares',
  '/admin/announcements',
];

test.describe('Support role', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    await prisma.user.upsert({
      where: { id: SUPPORT_ID },
      create: {
        id: SUPPORT_ID,
        name: 'Support Person',
        email: 'support@example.com',
        plexUserId: 'e2e-support-plex-id',
        isAdmin: false,
        role: 'support',
        primaryAuthService: 'plex',
        onboardingStatus: { plex: true, jellyfin: false },
      },
      update: { role: 'support', isAdmin: false, disabledAt: null },
    });
    await prisma.lLMProvider.upsert({
      where: { id: CHAT_PROVIDER_ID },
      create: { id: CHAT_PROVIDER_ID, provider: 'openai', purpose: 'chat', apiKey: 'sk-e2e', model: 'gpt-e2e' },
      update: { isActive: true },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    await prisma.lLMProvider.deleteMany({ where: { id: CHAT_PROVIDER_ID } });
    await prisma.user.deleteMany({ where: { id: SUPPORT_ID } });
    await prisma.$disconnect();
  });

  test('lands on the users list from the admin root and sees only the scoped navigation', async ({ supportPage: page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-users-page')).toBeVisible();

    await expect(page.getByTestId('admin-nav-users')).toBeVisible();
    for (const hidden of ['overview', 'settings', 'invites', 'queues', 'llm-usage', 'cost-analysis']) {
      await expect(page.getByTestId(`admin-nav-${hidden}`)).toHaveCount(0);
    }
  });

  test('has the assistant, and no member actions on the users list', async ({ supportPage: page }) => {
    await page.goto('/admin/users');
    await expect(page.getByTestId('admin-chat-toggle')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await page.getByTestId('admin-chat-toggle').click();
    await expect(page.getByTestId('admin-chat-sheet')).toBeVisible();
    await expect(page.getByTestId('admin-chat-input')).toBeVisible();
    await page.getByTestId('admin-chat-close').click();

    await expect(page.getByRole('button', { name: /actions/i })).toHaveCount(0);
  });

  for (const path of REFUSED_PATHS) {
    test(`is refused ${path} by the server`, async ({ supportPage: page }) => {
      await page.goto(path);

      await expect(page.getByTestId('unauthorized-error-page').or(page.getByTestId('not-found-home'))).toBeVisible({
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });
    });
  }

  test("is refused a member's detail page", async ({ supportPage: page }) => {
    await page.goto('/admin/users/regular-user-id');

    await expect(page.getByTestId('unauthorized-error-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('cannot call the admin search', async ({ supportPage: page }) => {
    const response = await page.request.get('/api/admin/search?kind=users&q=a');

    expect(response.status()).toBe(403);
  });
});
