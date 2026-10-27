import type { Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/auth';
import { expect, test } from '../fixtures/session';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRewindSeed, REWIND_MEMBERS, REWIND_YEAR, seedRewind } from '../helpers/seed-rewind';
import { editSection } from '../helpers/settings';

/**
 * P7.12: the Rewind section of `/admin/settings`. Saving "Admins only" hides
 * the home RewindCard from members and keeps it for admins, and a disabled
 * page leaves the heavy member's issue, whose folios renumber. The section's
 * visual baseline is in `e2e/visual/admin.visual.spec.ts`.
 */

const FLAGS = {
  rewindEnabled: true,
  rewindAudience: true,
  rewindSeasonOpens: true,
  rewindSeasonCloses: true,
  rewindDisabledPages: true,
} as const;

type Flags = {
  rewindEnabled: boolean;
  rewindAudience: string;
  rewindSeasonOpens: string;
  rewindSeasonCloses: string;
  rewindDisabledPages: string[];
};

async function setFlags(data: Partial<Flags>): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.config.update({ where: { id: 'config' }, data });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Saves the section and waits for the write: the section returns to its
 * summary only once the saved settings come back.
 */
async function saveSettings(page: Page): Promise<void> {
  await expect(page.getByTestId('settings-rewind-unsaved')).toBeVisible();
  await page.getByTestId('settings-rewind-save').click();
  await expect(page.getByTestId('settings-rewind-summary')).toBeVisible();
  await expect(page.getByTestId('settings-rewind-unsaved')).toHaveCount(0);
}

test.describe('Rewind settings section', () => {
  let previous: Flags | null = null;

  test.beforeAll(async () => {
    test.skip(new Date().getFullYear() !== REWIND_YEAR, `the seeded issues are for ${REWIND_YEAR}`);
    await seedRewind();
    const prisma = createE2EPrismaClient();
    try {
      const row = await prisma.config.findUnique({ where: { id: 'config' }, select: FLAGS });
      previous = row && {
        ...row,
        rewindDisabledPages: Array.isArray(row.rewindDisabledPages) ? row.rewindDisabledPages.map(String) : [],
      };
    } finally {
      await prisma.$disconnect();
    }
  });

  test.beforeEach(async () => {
    // The whole year is in season, Rewind is on for everyone and no page is disabled
    await setFlags({ rewindSeasonOpens: '01-01', rewindSeasonCloses: '12-31', rewindEnabled: true, rewindAudience: 'all', rewindDisabledPages: [] });
  });

  test.afterAll(async () => {
    if (previous) await setFlags(previous);
    await clearRewindSeed();
  });

  test('the section renders with its status line', async ({ page, signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
    await page.goto('/admin/settings#rewind');

    const section = page.getByTestId('settings-rewind-section');
    await expect(section).toBeVisible();
    await expect(section.getByTestId('rewind-settings-status')).toBeVisible();
    // Read-only until Edit
    await expect(section.getByTestId('settings-rewind-summary')).toBeVisible();
    await expect(page.getByTestId('settings-rewind-edit')).toBeVisible();
    await expect(page.getByTestId('settings-rewind-save')).toHaveCount(0);
  });

  test('"Admins only" hides the home RewindCard from a member and keeps it for an admin', async ({ page, signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
    await page.goto('/admin/settings#rewind');

    await editSection(page, 'rewind');
    await page.getByTestId('rewind-settings-audience-trigger').click();
    await page.getByTestId('rewind-settings-audience-option-admins').click();
    await saveSettings(page);
    await expect(page.getByTestId('settings-rewind-summary-audience')).toContainText('Admins');

    await page.goto('/');
    await expect(page.getByTestId('rewind-card')).toBeVisible();

    await signIn(REWIND_MEMBERS.median.id);
    await page.goto('/');
    await expect(page.getByTestId('rewind-card')).toHaveCount(0);
  });

  test('disabling People removes it from the heavy member\'s folios', async ({ page, signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
    await page.goto('/admin/settings#rewind');

    await editSection(page, 'rewind');
    await page.getByTestId('rewind-settings-pages-people').click();
    await saveSettings(page);

    await signIn(REWIND_MEMBERS.heavy.id);
    await page.goto(`/rewind/${REWIND_YEAR}/read`);
    await expect(page.getByTestId('rewind-article-mode')).toBeVisible();
    await expect(page.getByTestId('rewind-article-heading-people')).toHaveCount(0);

    const folios = await page.getByTestId('rewind-article-folio').allTextContents();
    const numbers = folios.map((folio) => Number(folio.trim()));
    expect(numbers).toEqual(numbers.map((_, i) => numbers[0] + i));
  });
});
