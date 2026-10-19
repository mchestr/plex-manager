import type { Page } from '@playwright/test';
import { TEST_USERS } from './fixtures/auth';
import { expect, test } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';

/**
 * Server and client format identically (P3.10, GAP-41): a browser in another
 * zone and locale than the server loads the pages that used to re-render on
 * hydration, with rows that format dates, numbers and money.
 *
 * `next dev` prints the hydration error; a production build logs React's
 * minified errors #418 (text), #423 (recovered) and #425 (text content).
 */
const HYDRATION_ERROR = /Hydration failed|did not match|didn't match|Minified React error #(418|423|425)/;

const ANNOUNCEMENT_ID = 'hydration-announcement';
const CONVERSATION_ID = 'hydration-conversation';
const USAGE_IDS = ['hydration-usage-1', 'hydration-usage-2'];

test.use({ timezoneId: 'America/Los_Angeles', locale: 'de-DE' });

function collectHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (HYDRATION_ERROR.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (HYDRATION_ERROR.test(error.message)) errors.push(error.message);
  });
  return errors;
}

async function removeSeed(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lLMUsage.deleteMany({ where: { id: { in: USAGE_IDS } } });
    await prisma.chatConversation.deleteMany({ where: { id: CONVERSATION_ID } });
    await prisma.announcement.deleteMany({ where: { id: ANNOUNCEMENT_ID } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Hydration across zones and locales', () => {
  test.beforeAll(async () => {
    await removeSeed();
    const prisma = createE2EPrismaClient();
    // 03:30 UTC is still the previous evening in Los Angeles, and grouped
    // numbers read 12,345 in en-US but 12.345 in de-DE.
    const createdAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    createdAt.setUTCHours(3, 30, 0, 0);
    try {
      await prisma.announcement.create({
        data: {
          id: ANNOUNCEMENT_ID,
          title: 'Hydration check',
          content: 'Dates and numbers must match on both sides.',
          isActive: true,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          createdBy: TEST_USERS.ADMIN.id,
        },
      });
      await prisma.chatConversation.create({
        data: { id: CONVERSATION_ID, userId: TEST_USERS.ADMIN.id, createdAt },
      });
      for (const [index, id] of USAGE_IDS.entries()) {
        await prisma.lLMUsage.create({
          data: {
            id,
            userId: TEST_USERS.ADMIN.id,
            chatConversationId: CONVERSATION_ID,
            provider: 'openai',
            model: 'gpt-5-mini',
            prompt: JSON.stringify([{ role: 'user', content: 'How many films this year?' }]),
            response: 'Plenty.',
            promptTokens: 12345,
            completionTokens: 2345,
            totalTokens: 14690,
            cost: 0.0874,
            createdAt: new Date(createdAt.getTime() + index * 60_000),
          },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(removeSeed);

  test.beforeEach(async ({ signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
  });

  test('announcements', async ({ page }) => {
    const errors = collectHydrationErrors(page);
    await page.goto('/admin/announcements');
    // A production build can stream a hidden copy beside the shown one until React swaps it in.
    await expect(page.getByTestId(`announcement-${ANNOUNCEMENT_ID}`).filter({ visible: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('LLM conversation', async ({ page }) => {
    const errors = collectHydrationErrors(page);
    await page.goto(`/admin/llm-usage/conversation/${CONVERSATION_ID}`);
    // A production build can stream a hidden copy beside the shown one until React swaps it in.
    const row = page.getByTestId(`conversation-usage-row-${USAGE_IDS[0]}`).filter({ visible: true });
    await expect(row).toBeVisible();
    // Grouped in the app locale (en-US), not the browser's de-DE.
    await expect(row).toContainText('14,690');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('users, All filter', async ({ page }) => {
    const errors = collectHydrationErrors(page);
    await page.goto('/admin/users');
    // The filter renders once per layout (phone and desktop); use the visible one.
    await page.getByTestId('users-filter-plex-access').filter({ visible: true }).click();
    await page.getByTestId('users-filter-plex-access-option-all').filter({ visible: true }).click();
    await expect(page.getByTestId(`user-row-${TEST_USERS.ADMIN.id}`).filter({ visible: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});
