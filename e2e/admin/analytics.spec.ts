import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures, VISUAL_REWIND_ID } from '../helpers/seed-fixtures';

/**
 * The analytics pages (P10.2): cost analysis shows the period in the URL,
 * a shares row opens that member's Rewind for the link's year, and page 2 of
 * LLM usage keeps the member filter.
 */
const SHARE_ID = 'e2e-analytics-share';
const USAGE_PREFIX = 'visual-llm-usage-e2e-';
const USAGE_COUNT = 30;

test.describe('Analytics pages', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedVisualFixtures();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.rewindShare.create({
        data: {
          id: SHARE_ID,
          wrappedId: VISUAL_REWIND_ID,
          tokenHash: 'e2e-analytics-token-hash',
          assetKey: 'e2e-analytics-asset-key',
          pages: ['cover', 'minutes'],
          cardFacts: {},
        },
      });
      // Standalone calls, one row each: enough for a second page of 25.
      await prisma.lLMUsage.createMany({
        data: Array.from({ length: USAGE_COUNT }, (_, index) => ({
          id: `${USAGE_PREFIX}${index}`,
          groupKey: `${USAGE_PREFIX}${index}`,
          userId: TEST_USERS.REGULAR.id,
          provider: 'openai',
          model: 'gpt-5-mini',
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          cost: 0.001,
          createdAt: new Date(Date.now() - index * 60_000),
        })),
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.rewindShare.deleteMany({ where: { id: SHARE_ID } });
      await prisma.lLMUsage.deleteMany({ where: { id: { startsWith: USAGE_PREFIX } } });
    } finally {
      await prisma.$disconnect();
    }
    await clearVisualFixtures();
  });

  test('cost analysis shows the period in the URL', async ({ adminPage }) => {
    await adminPage.goto('/admin/cost-analysis?from=2026-10-01&to=2026-10-17');
    await expect(adminPage.getByTestId('admin-cost-analysis-period')).toHaveText('Period: Oct 1 – Oct 17, 2026');
    await expect(adminPage.getByTestId('cost-dates-from')).toHaveValue('2026-10-01');
    await expect(adminPage.getByTestId('cost-dates-to')).toHaveValue('2026-10-17');
    await expect(adminPage.getByTestId('cost-projection')).toContainText("At this period's daily average");
  });

  test('a shares row opens the member and the year', async ({ adminPage }) => {
    const prisma = createE2EPrismaClient();
    const rewind = await prisma.plexWrapped.findUniqueOrThrow({ where: { id: VISUAL_REWIND_ID }, select: { year: true, userId: true } });
    await prisma.$disconnect();

    await adminPage.goto('/admin/shares');
    const row = adminPage.getByTestId(`admin-shares-row-${SHARE_ID}`);
    await expect(row).toBeVisible();
    await adminPage.getByTestId(`admin-shares-link-${SHARE_ID}`).click();
    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${rewind.userId}/rewind/${rewind.year}$`));
  });

  test('page 2 of LLM usage keeps the member filter', async ({ adminPage }) => {
    await adminPage.goto(`/admin/llm-usage?userId=${TEST_USERS.REGULAR.id}`);
    await adminPage.getByTestId('llm-usage-pagination-next').click();
    await expect(adminPage).toHaveURL(/page=2/);
    expect(new URL(adminPage.url()).searchParams.get('userId')).toBe(TEST_USERS.REGULAR.id);
    await expect(adminPage.getByTestId(/^llm-usage-row-/).first()).toBeVisible();
  });
});
