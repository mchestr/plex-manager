import { expect, test, TEST_USERS } from '../fixtures/auth';
import { disableAutoplay, goToPage, openStage } from '../helpers/rewind-stage';
import { clearRewindIssue, REWIND_ISSUES, seedRewindIssue } from '../helpers/seed-rewind';

/**
 * P5.7 (RWV-01): the centrefold sets the archetype name in whole words, and
 * "Why this?" opens and closes with Esc. The issue is the heavy golden
 * fixture as P5.9's pipeline stores it, seeded for the admin (admins pass
 * the Rewind flags). `rewind-e2e-chromium` and `rewind-e2e-webkit` run it
 * at both phone sizes (P5.4).
 */

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 548 },
];

test.describe('Rewind centrefold', () => {
  const name = String(REWIND_ISSUES.heavy.facts['archetype.name']?.display ?? '').replace(/^The /, '');

  test.beforeAll(() => seedRewindIssue(TEST_USERS.ADMIN.id, 'heavy'));
  test.afterAll(() => clearRewindIssue(TEST_USERS.ADMIN.id));

  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.width}x${viewport.height} the name breaks only between words, and Why this? opens and closes`, async ({ adminPage }) => {
      await adminPage.setViewportSize(viewport);
      await disableAutoplay(adminPage);
      // Below the 0.8 scale floor the article offer opens first; openStage keeps the story.
      await openStage(adminPage);
      // Next year (P7.2) now sits between the centrefold and the back cover
      await goToPage(adminPage, 'centrefold');

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
