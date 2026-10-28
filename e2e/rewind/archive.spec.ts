import AxeBuilder from '@axe-core/playwright';

import { expect, signInAs, test } from '../fixtures/session';
import { createE2EPrismaClient } from '../helpers/prisma';
import { ARCHIVE_YEAR, seedArchiveRewind } from '../helpers/seed-rewind';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * P7.13 (RWV-07): a stored v2 Rewind opens at `/rewind/2025` as an archive
 * article on paper, with no story, cards or sharing, axe at WCAG 2.2 AA finds
 * nothing, and no text on the page says "Wrapped" (the seeded row's own copy
 * does).
 *
 * Each project gets its own member, so chromium, webkit and firefox
 * (`rewind-e2e-*`) never share a row.
 */

test.describe('Rewind archive articles', () => {
  let memberId = '';

  test.beforeAll(async () => {
    memberId = `rewind-archive-${test.info().project.name}`;
    const prisma = createE2EPrismaClient();
    try {
      const row = { id: memberId, name: 'Archive member', email: `${memberId}@example.com`, plexUserId: `${memberId}-plex`, isAdmin: false, primaryAuthService: 'plex' as const, onboardingStatus: { plex: true, jellyfin: false } };
      await prisma.user.upsert({ where: { id: memberId }, create: row, update: row });
    } finally {
      await prisma.$disconnect();
    }
    await seedArchiveRewind(memberId);
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.deleteMany({ where: { id: memberId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('a stored v2 year opens as an article with no Wrapped copy', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL!, memberId);
    await page.goto(`/rewind/${ARCHIVE_YEAR}`);

    const article = page.getByTestId('rewind-article-mode');
    await expect(article).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(`Rewind ${ARCHIVE_YEAR}$`));
    await expect(article).toContainText('From the archive');
    await expect(page.getByTestId('rewind-article-facts')).toContainText('60,480');
    await expect(page.getByTestId('rewind-stage')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/Wrapped/);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('nextjs-portal').analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  test('the article route shows the same archive', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL!, memberId);
    await page.goto(`/rewind/${ARCHIVE_YEAR}/read`);

    await expect(page).toHaveURL(new RegExp(`/rewind/${ARCHIVE_YEAR}/read$`));
    await expect(page.getByTestId('rewind-article-mode')).toContainText('Top movies', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });
});
