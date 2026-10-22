import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * ChartCard on shadcn Chart and Recharts (P10.9): Tab reaches the daily cost
 * chart, the arrow keys move the active day, and the tooltip prints that
 * day's value. The chart is described by its generated summary.
 */
const USAGE_PREFIX = 'e2e-charts-usage-';
const DAY_MS = 24 * 60 * 60 * 1000;

test.describe('Admin charts', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      // Two days with different costs inside the default 30-day window.
      await prisma.lLMUsage.createMany({
        data: [
          { daysAgo: 1, cost: 0.25 },
          { daysAgo: 0, cost: 1.5 },
        ].map(({ daysAgo, cost }, index) => ({
          id: `${USAGE_PREFIX}${index}`,
          groupKey: `${USAGE_PREFIX}${index}`,
          userId: TEST_USERS.REGULAR.id,
          provider: 'openai',
          model: 'gpt-5-mini',
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          cost,
          createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        })),
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lLMUsage.deleteMany({ where: { id: { startsWith: USAGE_PREFIX } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('the daily cost chart works by keyboard', async ({ adminPage }) => {
    await adminPage.goto('/admin/cost-analysis');
    const card = adminPage.getByTestId('cost-daily-chart');
    const chart = card.getByTestId('cost-daily-chart-chart').getByRole('application');
    await expect(chart).toBeVisible();
    await expect(adminPage.getByTestId('cost-daily-chart-summary')).toContainText('in total from');
    await expect(chart).toHaveAttribute('aria-describedby', /.+/);

    // The table toggle comes first, then the chart.
    await adminPage.getByTestId('cost-daily-chart-table-toggle').focus();
    await adminPage.keyboard.press('Tab');
    await expect(chart).toBeFocused();

    const tooltip = adminPage.getByTestId('cost-daily-chart-tooltip');
    await expect(tooltip).toBeVisible();
    // ArrowRight stops at the last day (today); then step back a day.
    await expect(async () => {
      await adminPage.keyboard.press('ArrowRight');
      await expect(tooltip).toContainText('$1.50', { timeout: 250 });
    }).toPass({ timeout: 15_000 });
    await adminPage.keyboard.press('ArrowLeft');
    await expect(tooltip).toContainText('$0.250');
  });
});
