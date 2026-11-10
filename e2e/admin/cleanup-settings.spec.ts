import { join } from 'node:path';

import { expect, test } from '../fixtures/auth';
import { cleanupSeedIds } from '../helpers/cleanup-fixtures';
import { restorePlex, seedCleanup, useCleanupPlex, wipeCleanup } from '../helpers/seed-cleanup';
import { editSection } from '../helpers/settings';
import type { Page } from '@playwright/test';

/**
 * The Settings tab of Media cleanup (`/admin/cleanup?tab=settings`, UX 4.10,
 * TS 16.4): each of the six sections reads first, then Edit and Save through
 * `editSection()`; the Global protections impact line names the rules 500 ms
 * after a change; `?section=` opens a section in Edit and a valid `returnTo`
 * links back to the turn-on page after a save; and Pause and Resume in the
 * page header change the Media cleanup section.
 *
 * The seed (`seedCleanup()`) writes the default options, a rule in each mode
 * and a complete snapshot. Saves of the protections and member options run
 * their exits, which need no job queue. Without `REDIS_URL` the page shows
 * the Redis alert, and Refresh data now and Run all rules now are disabled
 * (plan 2.2): no case presses them. With `CLEANUP_SHOTS_DIR` set, the first
 * cases also write screenshots at 1440 x 900 and 390 x 844.
 */

const SETTINGS = '/admin/cleanup?tab=settings';
const ids = cleanupSeedIds();
const DRY_RULE = { id: ids.rules.dry, name: 'Movies nobody played in two years' };
const shotsDir = process.env.CLEANUP_SHOTS_DIR;

async function shot(page: Page, name: string, element?: string) {
  if (!shotsDir) return;
  const path = join(shotsDir, `${name}.png`);
  if (element) await page.getByTestId(element).screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
}

async function openSettings(page: Page, query = '') {
  await page.goto(`${SETTINGS}${query}`);
  await expect(page.getByTestId('settings-cleanup-feature-section')).toBeVisible();
}

/** Save the open section and wait for it to close: the toast says "Settings saved", or the busy words of UX 8.9. */
async function save(page: Page, id: string) {
  await page.getByTestId(`settings-${id}-save`).click();
  await expect(page.getByTestId('toast').filter({ hasText: /^Settings saved/ }).first()).toBeVisible();
  await expect(page.getByTestId(`settings-${id}-form`)).toBeHidden();
}

test.describe('Admin media cleanup settings', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCleanup();
    await useCleanupPlex();
  });

  test.afterAll(async () => {
    await restorePlex();
    await wipeCleanup();
  });

  test('reads each section first', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSettings(page);

    await expect(page.getByTestId('settings-cleanup-feature-state')).toContainText('On');
    await expect(page.getByTestId('settings-cleanup-feature-summary-enabled')).toContainText('On since');
    await expect(page.getByTestId('settings-cleanup-feature-summary-library')).toContainText('All 5 sources answered.');
    await expect(page.getByTestId('admin-cleanup-settings-last-run')).toBeVisible();
    await expect(page.getByTestId('settings-cleanup-protections-state')).toHaveText('12 on');
    await expect(page.getByTestId('settings-cleanup-protections-summary-g1')).toContainText('Always on');
    await expect(page.getByTestId('settings-cleanup-protections-summary-g13')).toContainText('Off');
    await expect(page.getByTestId('settings-cleanup-budget-summary-budget')).toContainText(
      'At most 20 items a day. At most 500 GB a day, but one title that is larger goes alone on its own day'
    );
    await expect(page.getByTestId('settings-cleanup-defaults-summary-grace')).toContainText('30 days');
    await expect(page.getByTestId('settings-cleanup-plex-summary-places')).toContainText("Your Home and members' Home. Not in Recommended.");
    await expect(page.getByTestId('settings-cleanup-plex-kometa')).toContainText('Kometa runs every 8 hours');
    await expect(page.getByTestId('settings-cleanup-members-summary-others')).toContainText('Nothing. Each member sees only their own link to a title.');
    await expect(page.getByRole('switch')).toHaveCount(0);
    await shot(page, 'settings-1440');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('settings-cleanup-members-section')).toBeVisible();
    await shot(page, 'settings-390');
  });

  test('edits Global protections, shows the impact line, and saves', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSettings(page);
    await editSection(page, 'cleanup-protections');

    const g1 = page.getByTestId('cleanup-protections-g1-enabled');
    await expect(g1).toHaveAttribute('aria-checked', 'true');
    await expect(g1).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('checkbox', { name: 'Played by anyone in the last 30 days' })).toBeVisible();

    const impact = page.getByTestId('cleanup-protections-impact');
    await expect(impact).toHaveAttribute('aria-live', 'polite');
    await expect(impact).toBeEmpty();
    await page.getByRole('textbox', { name: 'Days for: Played by anyone' }).fill('400');
    await expect(page.getByTestId('cleanup-protections-g4-row')).toContainText('Changed from 30 days.');
    await expect(impact).toContainText('With this change:');
    await expect(impact).toContainText(/Old movies to review|does not change|No rule changes/);

    await page.getByTestId('cleanup-protections-g9-tags').click();
    await expect(page.getByTestId('cleanup-protections-g9-tags-option-from-list')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('cleanup-protections-g13-enabled').click();
    await page.getByTestId('cleanup-protections-g13-collections').click();
    await page.getByTestId('cleanup-protections-g13-collections-option-rainy-sunday-picks').click();
    await page.keyboard.press('Escape');
    await expect(impact).toContainText('A new Plex collection counts after the next library read.');
    await shot(page, 'settings-protections-editing', 'settings-cleanup-protections-section');

    await save(page, 'cleanup-protections');
    await expect(page.getByTestId('settings-cleanup-protections-summary-g4')).toContainText('Played by anyone in the last 400 days');
    await expect(page.getByTestId('settings-cleanup-protections-summary-g13')).toContainText('In the Plex collection Rainy Sunday Picks');
    await expect(page.getByTestId('settings-cleanup-protections-state')).toHaveText('13 on');
  });

  test('edits and saves the deletion budget', async ({ adminPage: page }) => {
    await openSettings(page);
    await editSection(page, 'cleanup-budget');

    await page.getByTestId('cleanup-budget-items').fill('25');
    await page.getByTestId('cleanup-budget-bytes-unit-tb').click();
    await page.getByTestId('cleanup-budget-bytes').fill('2');
    await page.getByTestId('cleanup-budget-entry-percent').fill('15');
    await save(page, 'cleanup-budget');

    await expect(page.getByTestId('settings-cleanup-budget-summary-budget')).toContainText('At most 25 items a day. At most 2 TB a day');
    await expect(page.getByTestId('settings-cleanup-budget-summary-entry')).toContainText('or more than 15 % of the items checked');
  });

  test('refuses a value out of range on its field, then saves the defaults', async ({ adminPage: page }) => {
    await openSettings(page);
    await editSection(page, 'cleanup-defaults');

    const grace = page.getByTestId('cleanup-defaults-grace');
    await grace.fill('0');
    await page.getByTestId('settings-cleanup-defaults-save').click();
    await expect(page.getByTestId('cleanup-defaults-grace-error')).toHaveText('Enter a whole number of days from 1 to 3650.');
    await expect(page.getByTestId('settings-cleanup-defaults-form')).toBeVisible();

    await grace.fill('45');
    await page.getByTestId('cleanup-defaults-exclusion').click();
    await save(page, 'cleanup-defaults');
    await expect(page.getByTestId('settings-cleanup-defaults-summary-grace')).toContainText('45 days');
    await expect(page.getByTestId('settings-cleanup-defaults-summary-exclusion')).toContainText('Off');
  });

  test('edits and saves Plex visibility and the member options', async ({ adminPage: page }) => {
    await openSettings(page);
    await editSection(page, 'cleanup-plex');
    await page.getByTestId('cleanup-plex-recommended').click();
    await save(page, 'cleanup-plex');
    await expect(page.getByTestId('settings-cleanup-plex-summary-places')).toContainText("Your Home, members' Home and Recommended.");

    await editSection(page, 'cleanup-members');
    await expect(page.getByTestId('cleanup-members-keeps')).toHaveAccessibleDescription(
      'Turning this off stops new Keeps. Current Keeps protect their titles until they end.'
    );
    await page.getByTestId('cleanup-members-keep-days').fill('30');
    await page.getByTestId('cleanup-members-keep-limit').fill('5');
    await save(page, 'cleanup-members');
    await expect(page.getByTestId('settings-cleanup-members-summary-keep-days')).toContainText('30 days');
    await expect(page.getByTestId('settings-cleanup-members-summary-keep-limit')).toContainText('5 at a time');
  });

  test('opens ?section= in Edit, turns cleanup off with no dialog, and links back to the turn-on page', async ({ adminPage: page }) => {
    const returnTo = `/admin/cleanup/rules/${DRY_RULE.id}/turn-on`;
    await openSettings(page, `&section=cleanup-feature&returnTo=${encodeURIComponent(returnTo)}`);

    const enabled = page.getByRole('checkbox', { name: 'Turn on media cleanup' });
    await expect(page.getByTestId('settings-cleanup-feature-form')).toBeVisible();
    await expect(enabled).toHaveAttribute('aria-checked', 'true');
    await enabled.click();
    await expect(page.getByTestId('settings-cleanup-feature-form')).toContainText('Changed from on.');
    await save(page, 'cleanup-feature');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(page.getByTestId('settings-cleanup-feature-state')).toContainText('Off');
    await expect(page.getByTestId('admin-cleanup-alert-off')).toBeVisible();
    const back = page.getByTestId('admin-cleanup-settings-return');
    await expect(back).toHaveText(`Back to Turn on ${DRY_RULE.name}`);
    await expect(back).toHaveAttribute('href', returnTo);

    await editSection(page, 'cleanup-feature');
    await page.getByRole('checkbox', { name: 'Turn on media cleanup' }).click();
    await save(page, 'cleanup-feature');
    await expect(page.getByTestId('settings-cleanup-feature-state')).toContainText('On');
  });

  test('pauses and resumes all cleanup from the page header', async ({ adminPage: page }) => {
    await openSettings(page);

    const pauseDialog = page.getByTestId('admin-cleanup-pause-dialog');
    await expect(async () => {
      if (!(await pauseDialog.isVisible())) await page.getByTestId('admin-cleanup-pause').click();
      await expect(pauseDialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByTestId('admin-cleanup-pause-confirm').click();
    await expect(page.getByTestId('settings-cleanup-feature-state')).toContainText('Paused');
    await expect(page.getByTestId('settings-cleanup-feature-summary-enabled')).toContainText('Paused since');

    await page.getByTestId('admin-cleanup-resume').click();
    await expect(page.getByTestId('admin-cleanup-resume-dialog')).toBeVisible();
    await page.getByTestId('admin-cleanup-resume-confirm').click();
    await expect(page.getByTestId('settings-cleanup-feature-state')).toContainText('On');
    await expect(page.getByTestId('settings-cleanup-feature-summary-enabled')).toContainText('Nothing is deleted before');
  });
});
