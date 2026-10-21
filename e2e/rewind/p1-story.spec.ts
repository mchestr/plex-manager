import AxeBuilder from '@axe-core/playwright';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { chooseCut, currentPage, currentPageInfo, disableAutoplay, goToPage, openStage } from '../helpers/rewind-stage';
import { seedRewindIssue } from '../helpers/seed-rewind';

/**
 * P8.3: the P1 story features, each behind its `+key` in
 * `Config.rewindDisabledPages`: the race scrubber and Replay, "Pick a day",
 * the Notes calendar grid and first-tap completion. The spec turns all four
 * on for the heavy issue and restores the list afterwards.
 * `rewind-e2e-chromium` and `rewind-e2e-webkit` run it.
 */

const ENABLED = ['+race.scrubber', '+calendar.day-picker', '+calendar.grid', '+stage.tap-completes'];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

let stored: unknown = [];

async function setDisabledPages(value: unknown) {
  const prisma = createE2EPrismaClient();
  try {
    const row = await prisma.config.findUniqueOrThrow({ where: { id: 'config' }, select: { rewindDisabledPages: true } });
    await prisma.config.update({ where: { id: 'config' }, data: { rewindDisabledPages: value as string[] } });
    return row.rewindDisabledPages;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Rewind P1 story features', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedRewindIssue(TEST_USERS.ADMIN.id, 'heavy');
    stored = await setDisabledPages(ENABLED);
  });

  test.afterAll(async () => {
    await setDisabledPages(stored ?? []);
  });

  test('the race scrubber moves by keyboard without turning the page, and Replay reruns it', async ({ adminPage }) => {
    await adminPage.emulateMedia({ reducedMotion: 'reduce' });
    await disableAutoplay(adminPage);
    await openStage(adminPage);
    await goToPage(adminPage, 'race');
    const { index } = await currentPageInfo(adminPage);

    const slider = currentPage(adminPage).getByRole('slider', { name: 'Month' });
    await expect(slider).toHaveAttribute('aria-valuetext', 'November');
    await slider.focus();
    await adminPage.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', 'January');
    await adminPage.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', 'February');
    await expect(currentPage(adminPage)).toHaveAttribute('data-index', String(index));
    await expect(currentPage(adminPage).getByTestId('rewind-race-live')).toContainText('Standings after February');

    await currentPage(adminPage).getByTestId('rewind-race-play').click();
    await expect(slider).toHaveAttribute('aria-valuetext', 'November');
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });

    test('the race scrubber answers a tap, and pauses the story while in use', async ({ adminPage }) => {
      await adminPage.emulateMedia({ reducedMotion: 'reduce' });
      await openStage(adminPage);
      await goToPage(adminPage, 'race');
      const { index } = await currentPageInfo(adminPage);
      await currentPage(adminPage).getByTestId('rewind-race-scrubber').tap();
      await expect(adminPage.getByTestId('rewind-stage')).toHaveAttribute('data-mode', /interacting|paused/);
      await expect(currentPage(adminPage)).toHaveAttribute('data-index', String(index));
    });

    test('on page 02 the first tap lands the count-up and the second turns the page', async ({ adminPage }) => {
      await disableAutoplay(adminPage);
      await openStage(adminPage);
      await chooseCut(adminPage);
      expect((await currentPageInfo(adminPage)).type).toBe('number');

      const pages = adminPage.getByTestId('rewind-pages');
      const box = (await pages.boundingBox())!;
      const tapForward = () => adminPage.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height / 2);
      await tapForward();
      await expect(currentPage(adminPage)).toHaveAttribute('data-index', '1');
      await tapForward();
      await expect(currentPage(adminPage)).toHaveAttribute('data-index', '2');
    });
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 548 },
  ]) {
    test(`Pick a day opens a bottom sheet of 44 px days at ${viewport.width}x${viewport.height}`, async ({ adminPage }) => {
      await adminPage.setViewportSize(viewport);
      await disableAutoplay(adminPage);
      await openStage(adminPage);
      await goToPage(adminPage, 'calendar');

      await currentPage(adminPage).getByTestId('rewind-day-picker').click();
      const sheet = adminPage.getByTestId('rewind-day-picker-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('radiogroup', { name: 'Month' })).toBeVisible();
      const rows = sheet.getByTestId('rewind-day-picker-row');
      expect(await rows.count()).toBeGreaterThanOrEqual(28);
      const box = await rows.first().boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      const results = await new AxeBuilder({ page: adminPage }).include('[data-testid="rewind-day-picker-sheet"]').withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);

      await adminPage.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    });
  }

  test('the Notes calendar is a grid the arrow keys walk without turning the page, at 1440x900', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 1440, height: 900 });
    await disableAutoplay(adminPage);
    await openStage(adminPage);
    await goToPage(adminPage, 'calendar');
    const { index } = await currentPageInfo(adminPage);

    const grid = adminPage.getByTestId('rewind-calendar-grid').getByRole('grid');
    await expect(grid).toBeVisible();
    const focusable = grid.locator('[role="gridcell"][tabindex="0"]');
    await expect(focusable).toHaveCount(1);
    await focusable.focus();
    const first = await focusable.getAttribute('aria-label');
    await adminPage.keyboard.press('ArrowRight');
    await expect(grid.locator('[role="gridcell"]:focus')).not.toHaveAttribute('aria-label', first ?? '');
    await adminPage.keyboard.press('ArrowDown');
    await adminPage.keyboard.press('Enter');
    await expect(adminPage.getByTestId('rewind-calendar-detail')).not.toBeEmpty();
    await expect(currentPage(adminPage)).toHaveAttribute('data-index', String(index));

    const results = await new AxeBuilder({ page: adminPage }).include('[data-testid="rewind-calendar-grid"]').withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
