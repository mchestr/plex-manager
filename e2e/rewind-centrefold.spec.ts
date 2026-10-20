import { fixtureIssue } from '../lib/rewind/__tests__/helpers/fixture-issue';

import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * P5.7 (RWV-01): the centrefold sets the archetype name in whole words, and
 * "Why this?" opens and closes with Esc. The issue is the heavy golden
 * fixture as P5.9's pipeline would store it, seeded for the admin (admins
 * pass the Rewind flags). P5.4 runs this on chromium and webkit; until its
 * projects land it runs in the `chromium` project at both phone sizes.
 */

const YEAR = 2026;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 548 },
];

async function seedIssue() {
  const issue = await fixtureIssue('heavy', { serial: 'K7Q4', nthRewind: 4 });
  return {
    version: 3,
    year: YEAR,
    statsVersion: 'stats-2026.1',
    generatedAt: new Date('2026-12-01T12:00:00Z').toISOString(),
    window: { from: '2026-01-01', through: '2026-11-30', zone: 'America/Chicago', finalCut: false },
    edition: issue.edition,
    facts: issue.facts,
    pages: issue.pages.map(({ type, data }) => ({ type, data })),
    archetype: issue.archetype,
    copy: null,
    copySource: 'template',
    copyMeta: { model: null, promptVersion: 'e2e', slotHashes: {} },
    factsHash: 'e2e',
  };
}

test.describe('Rewind centrefold', () => {
  let name = '';

  test.beforeAll(async () => {
    const data = await seedIssue();
    name = String(data.facts['archetype.name']?.display ?? '').replace(/^The /, '');
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
      await prisma.plexWrapped.create({
        data: { userId: TEST_USERS.ADMIN.id, year: YEAR, status: 'completed', data: JSON.stringify(data), generatedAt: new Date(data.generatedAt) },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.width}x${viewport.height} the name breaks only between words, and Why this? opens and closes`, async ({ adminPage }) => {
      await adminPage.setViewportSize(viewport);
      await adminPage.goto(`/rewind/${YEAR}`);
      await expect(adminPage.getByTestId('rewind-stage')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      // Below the 0.8 scale floor the article offer opens first; keep the story.
      if (viewport.height < 600) await adminPage.getByTestId('rewind-article-offer-story').click();
      await adminPage.getByTestId('rewind-stage').focus();
      await adminPage.keyboard.press('End');
      await adminPage.keyboard.press('ArrowLeft');

      const nameplate = adminPage.locator('[data-current] [data-testid="rewind-archetype-name"]');
      await expect(nameplate).toBeVisible();
      const lines = await nameplate.locator(':scope > span > span').allTextContents();
      const words = name.split(' ');
      expect(lines.map((line) => line.trim()).join(' ')).toBe(name);
      for (const line of lines) {
        const run = line.trim().split(' ');
        const start = words.indexOf(run[0]);
        expect(start, line).toBeGreaterThanOrEqual(0);
        expect(words.slice(start, start + run.length)).toEqual(run);
      }

      await adminPage.locator('[data-current] [data-testid="rewind-archetype-why"]').click();
      await expect(adminPage.getByTestId('rewind-why-sheet')).toBeVisible();
      await adminPage.keyboard.press('Escape');
      await expect(adminPage.getByTestId('rewind-why-sheet')).toBeHidden();
      await expect(adminPage.getByTestId('rewind-stage')).toBeVisible();
    });
  }
});
