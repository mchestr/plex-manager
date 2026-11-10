import { join } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { cleanupSeedIds } from '../helpers/cleanup-fixtures';
import { clearCleanup, seedCleanup, wipeCleanup } from '../helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The rule editor (TS 16.4, UX 4.3, 7): add, edit and remove a condition with
 * Undo, an any-of group, a protection, the level block and the preview that
 * follows each edit; the Results tabs, the Why Sheet and Try; a live save
 * through the impact dialog; Move back to Dry run and two saves in a row on
 * a live rule (E25); a failed save that stays; the leave guard and an app
 * link that keeps the draft (E34); and "new rule twice" (architecture-r4-1).
 *
 * Every case seeds again in `beforeEach` (TS 16.4, delivery-r7-1), so no case
 * reads a rule that an earlier one changed. "Save and turn on..." and "after
 * turn on" need the turn-on page of `w5-turn-on` (plan D19, D20) and the job
 * queue: they skip without `REDIS_URL` and run last.
 *
 * With `CLEANUP_SHOTS_DIR` set, the editor and the impact dialog are also
 * saved at 1440 x 900 and 390 x 844 for the comparison with the mockups.
 */

const IDS = cleanupSeedIds();
const SHOTS = process.env.CLEANUP_SHOTS_DIR;
const QUEUE = 'Needs the job queue';

/** Saves the page at both widths of the mockups, then puts the viewport back. */
async function shoot(page: Page, name: string) {
  if (!SHOTS) return;
  const before = page.viewportSize();
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true });
  }
  if (before) await page.setViewportSize(before);
}

// The router keeps up to 3 visited routes in a hidden Activity, test ids included (TS 12.1 rule 8.3): look at the shown one
const tid = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const toast = (page: Page, text: string | RegExp) => page.getByTestId('toast').filter({ hasText: text });

/** Waits until the editor reacts: Rename opens its input, and Esc closes it again. */
async function hydrated(page: Page) {
  await expect(async () => {
    await tid(page, 'admin-cleanup-editor-rename').click();
    await expect(tid(page, 'admin-cleanup-editor-rename-input')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  await page.keyboard.press('Escape');
  await expect(tid(page, 'admin-cleanup-editor-rename-input')).toHaveCount(0);
}

async function openEditor(page: Page, path: string) {
  await page.goto(path);
  await expect(tid(page, 'admin-cleanup-editor-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  await hydrated(page);
}

/** The preview has settled: no request on its way. */
async function settled(page: Page) {
  await expect(tid(page, 'admin-cleanup-preview-updating')).toHaveCount(0, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
}

const count = async (page: Page) => Number((await tid(page, 'admin-cleanup-preview-count').textContent())?.replace(/,/g, ''));

/** Opens the condition editor at the value token, picks a preset and applies it with Done. */
async function pickPreset(page: Page, conditionId: string, preset: string) {
  await tid(page, `admin-cleanup-condition-${conditionId}-value`).click();
  const editor = tid(page, 'admin-cleanup-condition-editor');
  await expect(editor).toBeVisible();
  await tid(page, `admin-cleanup-condition-editor-preset-${preset}`).click();
  await tid(page, 'admin-cleanup-condition-editor-done').click();
  await expect(editor).toHaveCount(0);
}

async function chooseLevel(page: Page, level: 'movie' | 'show' | 'season') {
  await tid(page, 'admin-cleanup-scope-level').click();
  await tid(page, `admin-cleanup-scope-level-${level}`).click();
}

/** Opens the New rule Sheet of the Rules tab, retrying until the page has hydrated. */
async function openNewRule(page: Page): Promise<Locator> {
  const sheet = tid(page, 'admin-cleanup-new-rule-sheet');
  await expect(async () => {
    await tid(page, 'admin-cleanup-new-rule').click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  return sheet;
}

test.describe('Media cleanup rule editor', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await seedCleanup();
  });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
  });

  test('edits, adds and removes a condition with Undo, and the preview follows each edit', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.dry}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Movies nobody played in two years' })).toBeVisible();
    await expect(tid(page, 'admin-cleanup-editor-mode')).toHaveText('Dry run');
    await expect(tid(page, 'admin-cleanup-editor-turn-on')).toHaveText('Turn on...');
    const before = await count(page);

    // A chip shows its count at once: one year matches more than two
    await pickPreset(page, 'c1', '365-days');
    await expect(tid(page, 'admin-cleanup-condition-c1-value')).toContainText('365 days');
    await expect.poll(() => count(page), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT }).toBeGreaterThan(before);
    await expect(tid(page, 'admin-cleanup-preview-delta')).toContainText('more than before your last change');
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toBeVisible();
    await expect(tid(page, 'admin-cleanup-editor-turn-on')).toHaveText('Save and turn on...');
    await settled(page);
    await shoot(page, 'editor');

    // Add: a complete row, with the editor on its field search; Esc keeps the row
    await tid(page, 'admin-cleanup-add-condition').click();
    await expect(tid(page, 'admin-cleanup-condition-c4')).toHaveAccessibleName(/Added more than 90 days ago/);
    await expect(tid(page, 'admin-cleanup-condition-editor-field-search')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(tid(page, 'admin-cleanup-condition-editor')).toHaveCount(0);
    await expect(tid(page, 'admin-cleanup-condition-c4-field')).toBeFocused();

    // Remove with Undo: no dialog, focus to the previous row, and Undo puts it back
    await tid(page, 'admin-cleanup-condition-c4-remove').click();
    await expect(tid(page, 'admin-cleanup-condition-c4')).toHaveCount(0);
    await expect(tid(page, 'admin-cleanup-undo-c4')).toContainText('Condition removed: Added more than 90 days ago.');
    await tid(page, 'admin-cleanup-undo-c4-button').click();
    await expect(tid(page, 'admin-cleanup-condition-c4')).toBeVisible();
    await expect(tid(page, 'admin-cleanup-condition-c4-field')).toBeFocused();
    await expect(tid(page, 'admin-cleanup-undo-c4')).toHaveCount(0);
  });

  test('adds an any-of group and a rule protection', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.dry}`);
    await tid(page, 'admin-cleanup-add-group').click();
    const group = tid(page, 'admin-cleanup-group-a2');
    await expect(group).toHaveAccessibleName('Any of these, 2 conditions. One of them must be true.');
    await expect(tid(page, 'admin-cleanup-condition-c4-field')).toBeFocused();

    await tid(page, 'admin-cleanup-add-protection').click();
    await expect(tid(page, 'admin-cleanup-protection-p1')).toBeVisible();
    await expect(tid(page, 'admin-cleanup-condition-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    await settled(page);
    await expect(tid(page, 'admin-cleanup-plain-words')).toContainText('Never touch');
  });

  test('a level change blocks the save with the error summary', async ({ adminPage: page }) => {
    await openEditor(page, '/admin/cleanup/rules/new?level=show');
    await expect(tid(page, 'admin-cleanup-scope-level')).toContainText('Whole shows');
    await tid(page, 'admin-cleanup-add-condition').click();
    await expect(tid(page, 'admin-cleanup-condition-editor-field-search')).toBeFocused();
    await tid(page, 'admin-cleanup-condition-editor-field-option-show-status').click();
    await tid(page, 'admin-cleanup-condition-editor-done').click();
    await expect(tid(page, 'admin-cleanup-condition-c2-field')).toContainText('Show status');

    await chooseLevel(page, 'movie');
    await expect(page.getByText('You changed the level to Movies')).toBeVisible();
    await expect(tid(page, 'admin-cleanup-condition-c2-field')).toHaveAttribute('data-state', 'notApplicable');
    await tid(page, 'admin-cleanup-editor-create').click();
    const summary = tid(page, 'admin-cleanup-error-summary');
    await expect(summary).toContainText('Fix 1 thing before you save');
    await expect(summary).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/cleanup\/rules\/new\?level=show$/);
  });

  test('Results tabs, the Why Sheet of a near miss, and Try', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.review}`);
    await expect(tid(page, 'admin-cleanup-editor-mode')).toHaveText('Review first');
    await expect(tid(page, 'admin-cleanup-scope-level')).toHaveAttribute('data-state', 'readOnly');
    // In days, a near miss played some months ago has a value that includes it
    const lastPlayed = tid(page, 'admin-cleanup-condition-c1-value');
    await pickPreset(page, 'c1', '365-days');
    await expect(lastPlayed).toContainText('365 days');
    await settled(page);

    await tid(page, 'admin-cleanup-results-tab-near-misses').click();
    await expect(tid(page, 'admin-cleanup-results-tab-near-misses')).toHaveAttribute('aria-selected', 'true');
    const why = tid(page, 'admin-cleanup-results').getByRole('button', { name: 'Why: Velvet Harbor' });
    await expect(why).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await why.click();
    const sheet = tid(page, 'admin-cleanup-why');
    await expect(sheet).toBeVisible();
    await expect(tid(page, 'admin-cleanup-why-state')).toContainText('Near miss');
    await expect(tid(page, 'admin-cleanup-why-include')).toContainText('Or change Last played to more than');

    // Try changes the draft value only: the Sheet closes, and focus goes to the changed token
    await tid(page, 'admin-cleanup-why-try').click();
    await expect(sheet).toHaveCount(0);
    await expect(lastPlayed).toContainText('days');
    await expect(lastPlayed).not.toContainText('365 days');
    await expect(lastPlayed).toBeFocused();
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toBeVisible();
  });

  test('a live save that moves titles shows its impact first, then saves', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.review}`);
    await expect(tid(page, 'admin-cleanup-editor-change-mode')).toHaveText('Change mode...');
    // Two years: titles played in the second year no longer match
    await pickPreset(page, 'c1', '2-years');
    await settled(page);
    await tid(page, 'admin-cleanup-editor-save').click();

    const dialog = tid(page, 'admin-cleanup-impact-dialog');
    await expect(dialog).toContainText('Save changes to Old movies to review?', { timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });
    await expect(dialog).toContainText('This rule is in Review first.');
    await expect(dialog).toContainText(/\d+ movies? leaves? Leaving soon/);
    await tid(page, 'admin-cleanup-impact-toggle').click();
    await expect(tid(page, 'admin-cleanup-impact-list')).toContainText('Leave');
    await shoot(page, 'editor-impact');

    // Keep editing ends the press, and nothing saves
    await tid(page, 'admin-cleanup-impact-keep-editing').click();
    await expect(dialog).toHaveCount(0);
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toBeVisible();

    await tid(page, 'admin-cleanup-editor-save').click();
    await tid(page, 'admin-cleanup-impact-save').click();
    await expect(toast(page, /^Rule saved/)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(dialog).toHaveCount(0);
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toHaveCount(0);
  });

  test('on a live rule: change, Move back to Dry run, change the level, then two saves in a row', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.review}`);
    await pickPreset(page, 'c1', '2-years');

    const menu = tid(page, 'admin-cleanup-editor-menu');
    await menu.click();
    await tid(page, 'admin-cleanup-editor-menu-dry-run-mode').click();
    await tid(page, 'admin-cleanup-dry-run-mode-confirm').click();
    await expect(toast(page, 'Rule moved to Dry run')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-editor-mode')).toHaveText('Dry run');
    await expect(menu).toBeFocused();
    // The draft stays, and the level token is editable at once
    await expect(tid(page, 'admin-cleanup-condition-c1-value')).toContainText('2 years');
    await expect(tid(page, 'admin-cleanup-editor-turn-on')).toHaveText('Save and turn on...');
    await chooseLevel(page, 'show');
    await expect(tid(page, 'admin-cleanup-scope-level')).toContainText('Whole shows');

    await tid(page, 'admin-cleanup-editor-save').click();
    await expect(toast(page, 'Rule saved')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toHaveCount(0);

    await pickPreset(page, 'c1', '365-days');
    await tid(page, 'admin-cleanup-editor-save').click();
    await expect(toast(page, 'Rule saved')).toHaveCount(2, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(toast(page, 'Someone changed this rule')).toHaveCount(0);
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toHaveCount(0);
  });

  test('a failed save stays in the editor with the error summary', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.dry}`);
    await tid(page, 'admin-cleanup-scope-libraries').click();
    await tid(page, 'admin-cleanup-scope-library-1').click();
    await page.keyboard.press('Escape');
    await expect(tid(page, 'admin-cleanup-scope-libraries')).toContainText('Choose a library');

    await page.keyboard.press('Control+s');
    const summary = tid(page, 'admin-cleanup-error-summary');
    await expect(summary).toContainText('Fix 1 thing before you save');
    await expect(summary).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${IDS.rules.dry}$`));
    await expect(toast(page, 'Rule saved')).toHaveCount(0);
  });

  test('an app link keeps the draft, and a close with changes asks the browser first', async ({ adminPage: page }) => {
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.dry}`);
    await pickPreset(page, 'c1', '365-days');
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toBeVisible();

    // An app link shows no prompt, and the kept route shows the draft again (E34)
    let prompted = false;
    page.on('dialog', async (dialog) => {
      prompted = true;
      await dialog.dismiss();
    });
    await tid(page, 'admin-cleanup-editor-header-crumb-1').click();
    await expect(page).toHaveURL(/\/admin\/cleanup$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await tid(page, `admin-cleanup-rule-${IDS.rules.dry}-edit`).click();
    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${IDS.rules.dry}$`), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toBeVisible();
    await expect(tid(page, 'admin-cleanup-condition-c1-value')).toContainText('365 days');
    expect(prompted).toBe(false);

    // A close with changes gets the browser's own prompt (architecture-r4-2)
    const second = await page.context().newPage();
    await openEditor(second, `/admin/cleanup/rules/${IDS.rules.dry}`);
    await pickPreset(second, 'c1', '365-days');
    const asked = new Promise<string>((resolve) => second.once('dialog', async (dialog) => {
      resolve(dialog.type());
      await dialog.accept();
    }));
    await second.close({ runBeforeUnload: true });
    expect(await asked).toBe('beforeunload');
  });

  test('new rule twice: each blank start is fresh, and a recipe start shows its own conditions', async ({ adminPage: page }) => {
    await page.goto('/admin/cleanup');
    await expect(tid(page, 'admin-cleanup-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    let sheet = await openNewRule(page);
    await sheet.getByTestId('admin-cleanup-new-rule-blank').click();
    await expect(page).toHaveURL(/\/admin\/cleanup\/rules\/new$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await hydrated(page);
    await expect(tid(page, 'admin-cleanup-condition-c1')).toBeVisible();
    await tid(page, 'admin-cleanup-add-condition').click();
    await page.keyboard.press('Escape');
    await expect(tid(page, 'admin-cleanup-condition-c2')).toBeVisible();

    await tid(page, 'admin-cleanup-editor-create').click();
    await expect(toast(page, 'Rule created')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page).toHaveURL(/\/admin\/cleanup\/rules\/(?!new)[A-Za-z0-9_-]+$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByRole('heading', { level: 1, name: 'New rule' })).toBeFocused();
    await expect(tid(page, 'admin-cleanup-condition-c2')).toBeVisible();

    // Back by the app's own links: a second blank start shows the start draft, not the created one
    await tid(page, 'admin-cleanup-editor-header-crumb-1').click();
    await expect(page).toHaveURL(/\/admin\/cleanup$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    sheet = await openNewRule(page);
    await sheet.getByTestId('admin-cleanup-new-rule-blank').click();
    await expect(page).toHaveURL(/\/admin\/cleanup\/rules\/new$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-condition-c1')).toBeVisible();
    await expect(tid(page, 'admin-cleanup-condition-c2')).toHaveCount(0);
    await expect(tid(page, 'admin-cleanup-editor-unsaved')).toHaveCount(0);

    // "Change all conditions" on a recipe opens that recipe's conditions
    await tid(page, 'admin-cleanup-editor-header-crumb-1').click();
    await expect(page).toHaveURL(/\/admin\/cleanup$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    sheet = await openNewRule(page);
    await sheet.getByTestId('admin-cleanup-new-rule-recipe-never-watched-movies').click();
    const recipe = tid(page, 'admin-cleanup-recipe-sheet');
    await recipe.getByTestId('admin-cleanup-recipe-change-all').click();
    await expect(page).toHaveURL(/\/admin\/cleanup\/rules\/new\?recipe=never-watched-movies/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByRole('heading', { level: 1, name: 'Never watched movies' })).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-condition-c1-field')).toContainText('Last played');
    await expect(tid(page, 'admin-cleanup-condition-c2-field')).toContainText('Added');
  });

  // The two cases below turn the Dry run rule on, so they run last; each seeds again first (TS 16.4, delivery-r7-1)
  test('Save and turn on... saves, then the turn-on page counts the saved rule; a failed save stays @needs-turn-on', async ({ adminPage: page }) => {
    test.skip(!process.env.REDIS_URL, QUEUE);
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.dry}`);
    const next = tid(page, 'admin-cleanup-editor-turn-on');

    await tid(page, 'admin-cleanup-scope-libraries').click();
    await tid(page, 'admin-cleanup-scope-library-1').click();
    await page.keyboard.press('Escape');
    await next.click();
    await expect(tid(page, 'admin-cleanup-error-summary')).toContainText('Fix 1 thing before you save');
    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${IDS.rules.dry}$`));

    await tid(page, 'admin-cleanup-scope-libraries').click();
    await tid(page, 'admin-cleanup-scope-library-1').click();
    await page.keyboard.press('Escape');
    await pickPreset(page, 'c1', '365-days');
    await settled(page);
    const matches = await count(page);
    await expect(next).toHaveText('Save and turn on...');
    await next.click();
    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${IDS.rules.dry}/turn-on$`), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-turn-on-headline')).toContainText(`${matches.toLocaleString('en-US')} movie`, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('after turn on, the kept editor shows the live mode and saves with no conflict @needs-turn-on', async ({ adminPage: page }) => {
    test.skip(!process.env.REDIS_URL, QUEUE);
    await openEditor(page, `/admin/cleanup/rules/${IDS.rules.dry}`);
    await tid(page, 'admin-cleanup-editor-turn-on').click();
    await expect(tid(page, 'admin-cleanup-turn-on-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    const confirm = tid(page, 'admin-cleanup-turn-on-confirm');
    await expect(confirm).toBeEnabled({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await confirm.click();

    // The turn-on page opens the rule page by the app's own navigation: the kept editor follows the new revision
    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${IDS.rules.dry}$`), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-editor-mode')).toHaveText('Review first', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(tid(page, 'admin-cleanup-scope-level')).toHaveAttribute('data-state', 'readOnly');
    await expect(tid(page, 'admin-cleanup-editor-change-mode')).toHaveText('Change mode...');

    await pickPreset(page, 'c1', '365-days');
    await settled(page);
    await tid(page, 'admin-cleanup-editor-save').click();
    const impact = tid(page, 'admin-cleanup-impact-save');
    if (await impact.isVisible({ timeout: WAIT_TIMEOUTS.SHORT_CHECK }).catch(() => false)) await impact.click();
    await expect(toast(page, /^Rule saved/)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(toast(page, 'Someone changed this rule')).toHaveCount(0);
  });
});
