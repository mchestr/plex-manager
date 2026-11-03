import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The AdminShell (P6.1, ui-design-system 6.2): on a phone the top bar opens
 * the assistant page, each tab is the element under its own centre, nothing
 * scrolls sideways and More is the one menu; on desktop every sidebar link
 * opens its page and marks itself current.
 */
const CHAT_PROVIDER_ID = 'e2e-admin-shell-chat';

const SIDEBAR_LINKS: Array<[testId: string, path: RegExp]> = [
  ['admin-nav-assistant', /\/admin\/assistant$/],
  ['admin-nav-members', /\/admin\/users$/],
  ['admin-nav-announcements', /\/admin\/announcements$/],
  ['admin-nav-discord', /\/admin\/discord$/],
  ['admin-nav-rewind', /\/admin\/rewind$/],
  ['admin-nav-ai', /\/admin\/ai$/],
  ['admin-nav-automations', /\/admin\/watchlist$/],
  ['admin-nav-settings', /\/admin\/settings$/],
];

test.describe('Admin shell', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    await prisma.lLMProvider.upsert({
      where: { id: CHAT_PROVIDER_ID },
      // The mock chat model (e2e/mocks/llm-server.ts), so nothing reaches a real provider
      create: { id: CHAT_PROVIDER_ID, provider: 'openai-compatible', purpose: 'chat', apiKey: '', model: 'gpt-e2e', baseUrl: process.env.E2E_LLM_URL },
      update: { isActive: true, baseUrl: process.env.E2E_LLM_URL },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    await prisma.lLMProvider.deleteMany({ where: { id: CHAT_PROVIDER_ID } });
    await prisma.$disconnect();
  });

  test('on a phone: the top bar opens the assistant, the tabs are hit-testable, nothing scrolls sideways', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/users');
    await expect(page.getByTestId('admin-tab-bar')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-sidebar')).toBeHidden();
    // More is the one phone menu: the top bar has no menu button of its own
    await expect(page.getByTestId('admin-menu-button')).toHaveCount(0);

    await page.getByTestId('admin-assistant-link-mobile').click();
    await expect(page).toHaveURL(/\/admin\/assistant$/);
    await expect(page.getByTestId('admin-chat-input')).toBeVisible();
    await expect(page.getByTestId('admin-assistant-link-mobile')).toHaveAttribute('aria-current', 'page');
    await page.goto('/admin/users');
    await expect(page.getByTestId('admin-tab-bar')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    for (const id of ['overview', 'members', 'rewind', 'automations', 'more']) {
      const tab = page.getByTestId(`admin-tab-${id}`);
      const box = await tab.boundingBox();
      expect(box, `admin-tab-${id} has a box`).not.toBeNull();
      const hit = await page.evaluate(
        ({ x, y, testId }) => document.elementFromPoint(x, y)?.closest(`[data-testid="${testId}"]`) !== null,
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, testId: `admin-tab-${id}` }
      );
      expect(hit, `admin-tab-${id} is the element under its centre`).toBe(true);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    // Settings is no tab: it opens from More, which lists every item
    await expect(page.getByTestId('admin-tab-settings')).toHaveCount(0);
    await page.getByTestId('admin-tab-more').click();
    await expect(page.getByTestId('admin-more-sheet')).toBeVisible();
    await page.getByTestId('admin-nav-settings-mobile').click();
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await expect(page.getByTestId('admin-more-sheet')).toBeHidden();
  });

  test('on desktop: each sidebar link opens its page and marks itself current', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/users');
    const sidebar = page.getByTestId('admin-sidebar');
    await expect(sidebar).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    for (const [testId, path] of SIDEBAR_LINKS) {
      await sidebar.getByTestId(testId).click();
      await expect(page).toHaveURL(path);
      await expect(sidebar.getByTestId(testId)).toHaveAttribute('aria-current', 'page');
    }
  });
});
