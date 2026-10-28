import type { Locator, Page } from '@playwright/test';

import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
import { mockLlmReply } from './mocks/llm-server';

/**
 * The assistant page (`/admin/assistant`): a new conversation takes its own
 * URL with the first reply and joins the history, a reload shows it again
 * from the stored turns, and Delete takes it out of the history. The chat
 * model is the mock in `e2e/mocks/llm-server.ts`.
 */
const CHAT_PROVIDER_ID = 'e2e-assistant-page-chat';
const SEEDED_ID = 'e2e-assistant-seeded';
const OTHER_USERS_ID = 'e2e-assistant-other-user';

/** The element's bottom edge is above the fixed tab bar's top edge, with the page as it is now scrolled. */
async function expectAboveTabBar(page: Page, element: Locator) {
  const box = await element.boundingBox();
  const bar = await page.getByTestId('admin-tab-bar').boundingBox();
  expect(box && bar && box.y + box.height <= bar.y + 1).toBe(true);
}

/** The admin's assistant conversations, so each run starts with an empty history. */
const ADMIN_CHATS = { userId: TEST_USERS.ADMIN.id, lastMessageAt: { not: null } };

async function clean() {
  const prisma = createE2EPrismaClient();
  await prisma.chatConversation.deleteMany({ where: { OR: [ADMIN_CHATS, { id: OTHER_USERS_ID }] } });
  await prisma.$disconnect();
}

test.describe('Assistant page', () => {
  test.beforeAll(async () => {
    await clean();
    const prisma = createE2EPrismaClient();
    await prisma.lLMProvider.upsert({
      where: { id: CHAT_PROVIDER_ID },
      create: {
        id: CHAT_PROVIDER_ID,
        provider: 'openai-compatible',
        purpose: 'chat',
        apiKey: '',
        model: 'gpt-e2e',
        baseUrl: process.env.E2E_LLM_URL,
      },
      update: { isActive: true, baseUrl: process.env.E2E_LLM_URL },
    });
    // Another member's conversation, which the admin's page must not open
    await prisma.chatConversation.create({
      data: { id: OTHER_USERS_ID, userId: TEST_USERS.REGULAR.id, title: 'Not yours', lastMessageAt: new Date() },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    await clean();
    const prisma = createE2EPrismaClient();
    await prisma.lLMProvider.deleteMany({ where: { id: CHAT_PROVIDER_ID } });
    await prisma.$disconnect();
  });

  test('a new conversation takes its URL, comes back after a reload and deletes', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/assistant');
    await expect(page.getByTestId('admin-chat-welcome')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-nav-assistant')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('admin-assistant-history-empty')).toBeVisible();

    const question = 'Is Sonarr downloading anything?';
    const input = page.getByTestId('admin-chat-input');
    await input.fill(question);
    await input.press('Enter');

    const log = page.getByTestId('admin-chat-log');
    await expect(log).toContainText(mockLlmReply(question), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page).toHaveURL(/\/admin\/assistant\?conversation=[A-Za-z0-9_-]+$/);
    await expect(input).toBeFocused();
    const id = new URL(page.url()).searchParams.get('conversation') ?? '';

    const item = page.getByTestId(`admin-assistant-history-item-${id}`);
    await expect(item).toHaveText(question);
    await expect(item).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('admin-assistant-title')).toHaveText(question);

    // The model reads the follow-up after the stored first turn, and a reload shows both turns in order
    const followUp = 'And Radarr?';
    await input.fill(followUp);
    await page.getByTestId('admin-chat-send').click();
    await expect(log).toContainText(mockLlmReply(followUp, 2), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await page.reload();
    await expect(log.getByTestId('admin-chat-question')).toContainText([question, followUp], { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(log.getByTestId('admin-chat-answer')).toContainText([mockLlmReply(question), mockLlmReply(followUp, 2)]);

    await page.getByTestId(`admin-assistant-history-delete-${id}`).click();
    await page.getByTestId('admin-assistant-delete-confirm').click();
    await expect(page).toHaveURL(/\/admin\/assistant$/);
    await expect(page.getByTestId('admin-chat-welcome')).toBeVisible();
    await expect(item).toHaveCount(0);

    await page.goto(`/admin/assistant?conversation=${id}`);
    await expect(page.getByTestId('not-found-home')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('opens a past conversation from the history sheet on a phone', async ({ adminPage: page }) => {
    const prisma = createE2EPrismaClient();
    await prisma.chatConversation.create({
      data: {
        id: SEEDED_ID,
        userId: TEST_USERS.ADMIN.id,
        title: 'Why is the living room TV buffering?',
        lastMessageAt: new Date(),
        messages: {
          create: [
            { role: 'user', content: 'Why is the living room TV buffering?' },
            { role: 'assistant', content: 'It is transcoding 4K to 1080p.', sources: [{ tool: 'get_plex_sessions', description: 'Plex sessions' }] },
          ],
        },
      },
    });
    await prisma.$disconnect();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/assistant');
    await page.getByTestId('admin-assistant-history-open').click();
    await expect(page.getByTestId('admin-assistant-history-sheet')).toBeVisible();
    await page.getByTestId(`admin-assistant-history-mobile-item-${SEEDED_ID}`).click();

    await expect(page).toHaveURL(new RegExp(`/admin/assistant\\?conversation=${SEEDED_ID}$`));
    await expect(page.getByTestId('admin-assistant-history-sheet')).toBeHidden();
    await expect(page.getByTestId('admin-chat-log')).toContainText('It is transcoding 4K to 1080p.');
    await expect(page.getByTestId('admin-chat-log')).toContainText('Get Plex Sessions');
    // Focus follows the conversation to its title, whatever order the sheet and the page finish in
    await expect(page.getByTestId('admin-assistant-title')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test('keeps the conversation readable on a short, zoomed-in screen', async ({ adminPage: page }) => {
    // 1280x1024 at 400% zoom (WCAG 1.4.10): the page keeps a floor of height and scrolls instead
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto('/admin/assistant');
    const log = page.getByTestId('admin-chat-log');
    await expect(log).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    expect((await log.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(100);
    // Focus brings the message box clear of the fixed tab bar (WCAG 2.4.11)
    const input = page.getByTestId('admin-chat-input');
    await input.focus();
    await expectAboveTabBar(page, input);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });

  test('keeps the message box pinned above the tab bar on a landscape phone', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 667, height: 330 });
    await page.goto('/admin/assistant');
    const input = page.getByTestId('admin-chat-input');
    await expect(input).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expectAboveTabBar(page, input);
    expect((await page.getByTestId('admin-chat-log').boundingBox())?.height ?? 0).toBeGreaterThan(0);
  });

  test("does not open another user's conversation", async ({ adminPage: page }) => {
    await page.goto(`/admin/assistant?conversation=${OTHER_USERS_ID}`);

    await expect(page.getByTestId('not-found-home')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });
});
