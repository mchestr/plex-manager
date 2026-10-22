import { expect, test } from '../fixtures/session';
import { disableAutoplay, openStage } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind } from '../helpers/seed-rewind';

/**
 * The cover's cut choice (P7.3, FR-4), in `rewind-e2e-chromium` and
 * `rewind-e2e-webkit`: the heavy member can switch a full issue to the
 * six-page pocket edition, which renumbers every folio and survives a
 * reload, and the light member's pocket issue offers only the pocket button.
 */

test.describe('Rewind editions', () => {
  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  test('the heavy member picks the pocket edition and gets six pages', async ({ page, signIn }) => {
    await signIn(REWIND_MEMBERS.heavy.id);
    await disableAutoplay(page);
    await openStage(page);

    await page.getByTestId('rewind-cut-pocket').click();
    const folio = page.getByTestId('rewind-folio');
    await expect(folio).toContainText('02/06');
    await page.keyboard.press('ArrowLeft');
    await expect(folio).toContainText('01/06');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('rewind-page-short-list')).toBeVisible();

    // The choice is kept for the session, so opening it again resumes the same cut
    await openStage(page);
    await expect(folio).toContainText('01/06');
  });

  test('the light member sees only the pocket button', async ({ page, signIn }) => {
    await signIn(REWIND_MEMBERS.light.id);
    await openStage(page);
    await expect(page.getByTestId('rewind-pocket-note')).toHaveText('The pocket edition');
    await expect(page.getByTestId('rewind-cut-full')).toHaveCount(0);
    await expect(page.getByTestId('rewind-cut-pocket')).toBeVisible();
    await page.getByTestId('rewind-cut-pocket').click();
    await expect(page.getByTestId('rewind-folio')).toContainText('02/06');
  });
});
