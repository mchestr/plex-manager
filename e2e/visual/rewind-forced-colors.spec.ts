import { chooseCut, currentPageInfo, disableAutoplay, openStage, pageCount, turnForward } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind } from '../helpers/seed-rewind';
import { expect, settlePage, skipUnlessProductionBuild, test } from './visual-test';

/**
 * Forced-colours screenshots (P7.15, design 11.1): every page of the heavy
 * issue at 390x844 under `forced-colors: active`, in
 * `rewind-visual-phone-chromium` only (Playwright emulates forced colours on
 * chromium). The blocking checks of the same pages are
 * `e2e/a11y/rewind-forced-colors.a11y.spec.ts`.
 */

test.describe('Rewind under forced colours', () => {
  skipUnlessProductionBuild();

  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  test('every page of the heavy issue', async ({ page, signIn }, testInfo) => {
    test.skip(testInfo.project.name !== 'rewind-visual-phone-chromium', 'One phone project on chromium takes these');
    test.setTimeout(180_000);
    await disableAutoplay(page);
    await page.emulateMedia({ forcedColors: 'active' });
    await signIn(REWIND_MEMBERS.heavy.id);
    await openStage(page, { settle: settlePage });

    const total = await pageCount(page);
    for (let i = 0; i < total; i++) {
      if (i === 1) await chooseCut(page);
      else if (i > 1) await turnForward(page);
      await settlePage(page);
      const { type } = await currentPageInfo(page);
      await expect(page.getByTestId('rewind-stage')).toHaveScreenshot(`forced-colors-heavy-${String(i + 1).padStart(2, '0')}-${type}.png`);
    }
  });
});
