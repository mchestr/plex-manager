import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { CLEANUP_RULE_DEFINITIONS, cleanupSeedIds, definitionHash } from '../helpers/cleanup-fixtures';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearCleanup, restorePlex, seedCleanup, useCleanupPlex, wipeCleanup } from '../helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The turn-on review page (UX 4.6, TS 16.4) on the seeded snapshot of
 * `seedCleanup()`: the Dry run rule "Movies nobody played in two years" and
 * the Review first rule "Old movies to review" (Change mode).
 *
 * - The ready checks, the cards and the Why Sheet of a row. Focus starts on
 *   the title, and no button has default focus.
 * - The Automatic reasons: the first batch above 10 % of the checked
 *   movies, and a live rule with no finished dry run.
 * - Change mode to Automatic above 50 titles asks for the typed count.
 * - Feature off: the check names its fix, "Open settings" carries
 *   `returnTo`, and below `lg` the check also shows at the top.
 *   "Back to Turn on {rule}" needs the Settings tab (`@needs-settings`).
 * - The cases that press "Turn on" need the job queue, so they skip without
 *   `REDIS_URL` (TS 16.4, delivery-r6-3): typed approval, the stale numbers
 *   (also after a save in another tab, `@needs-editor`) and "Success opens
 *   the rule page" (`@needs-editor`). They run last, and each seeds again
 *   first, because two of them turn a rule on (delivery-r7-1, delivery-r8-2).
 * - With `CLEANUP_SHOTS_DIR` set, it writes the page at 1440 and 390 wide.
 *
 * afterAll puts the Plex row back and wipes the cleanup rows.
 */

const PREFIX = 'e2e-turn-on';
const IDS = cleanupSeedIds(PREFIX);
const DRY = { id: IDS.rules.dry, name: 'Movies nobody played in two years' };
const REVIEW = { id: IDS.rules.review, name: 'Old movies to review' };
const NEEDS_QUEUE = 'Needs the job queue';

const turnOnPath = (id: string, mode?: 'automatic') => `/admin/cleanup/rules/${id}/turn-on${mode ? `?mode=${mode}` : ''}`;
const confirm = (page: Page) => page.getByTestId('admin-cleanup-turn-on-confirm');
const radio = (page: Page, name: RegExp) => page.getByTestId('admin-cleanup-turn-on-mode').getByRole('radio', { name });

async function openTurnOn(page: Page, id: string, mode?: 'automatic') {
  await page.goto(turnOnPath(id, mode));
  await expect(page.getByTestId('admin-cleanup-turn-on-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  // The title takes focus once React has hydrated the page
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
}

async function setFeature(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.cleanupSettings.update({ where: { id: 'cleanup' }, data: { enabled } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Three steady dry runs of the Review first rule's saved definition, so Automatic is allowed for it (X7). */
async function giveReviewRuleDryRuns() {
  const prisma = createE2EPrismaClient();
  try {
    const rule = await prisma.cleanupRule.findUniqueOrThrow({ where: { id: REVIEW.id }, select: { stats: true } });
    const stats = rule.stats as { lastEval?: { matches?: number; bytes?: number } };
    const hash = definitionHash(CLEANUP_RULE_DEFINITIONS.review);
    const dryRuns = [3, 2, 1].map((days, i) => ({
      at: new Date(Date.now() - days * 86_400_000).toISOString(), runId: `${REVIEW.id}-dry-${i}`, snapshotId: `${REVIEW.id}-snap-${i}`,
      matches: stats.lastEval?.matches ?? 0, bytes: stats.lastEval?.bytes ?? 0, definitionHash: hash,
    }));
    await prisma.cleanupRule.update({ where: { id: REVIEW.id }, data: { stats: { ...stats, dryRuns } } });
  } finally {
    await prisma.$disconnect();
  }
}

async function ruleRow(id: string) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.cleanupRule.findUniqueOrThrow({ where: { id }, select: { mode: true, revision: true } });
  } finally {
    await prisma.$disconnect();
  }
}

/** The count that Automatic asks to type, from the field's label. */
async function typedCount(page: Page): Promise<string> {
  const label = await page.getByText(/^Type \d+ to turn on Automatic$/).textContent();
  return label?.match(/\d+/)?.[0] ?? '';
}

test.describe('Admin media cleanup: turn on a rule', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCleanup(PREFIX);
    await useCleanupPlex();
  });

  test.afterAll(async () => {
    await restorePlex();
    await wipeCleanup();
    await clearCleanup(PREFIX);
  });

  test('checks: a Dry run rule shows its review, its ready checks and the Why of a row', async ({ adminPage: page }) => {
    await openTurnOn(page, DRY.id);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Turn on ${DRY.name}`);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(`Media cleanup/Rules/${DRY.name}/Turn on`);
    await expect(page.getByTestId('admin-cleanup-turn-on-check-feature-on')).toHaveText('Media cleanup is on.');
    await expect(page.getByTestId('admin-cleanup-turn-on-check-library-data')).toContainText('answered at');
    await expect(page.getByTestId('admin-cleanup-turn-on-check-history-covers')).toContainText(/That covers the \d+-day window\.$/);
    await expect(page.getByTestId('admin-cleanup-turn-on-check-dry-runs')).toHaveText('3 dry runs, with steady matches.');
    await expect(page.getByTestId('admin-cleanup-turn-on-headline')).toHaveText(/^\d+ movies go into Leaving soon\.$/);
    await expect(confirm(page)).toHaveAccessibleName(/^Put \d+ movies in Leaving soon$/);
    await expect(page.getByTestId('admin-cleanup-turn-on-confirm-note')).toHaveText('At the leave date: Review first. Nothing is deleted until you approve.');
    if (!process.env.REDIS_URL) {
      await expect(confirm(page)).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId('admin-cleanup-turn-on-reason')).toHaveText('Redis is not set up. Library reads and runs need the job queue.');
    }
    await expect(page.getByTestId('admin-cleanup-turn-on-cancel')).toHaveAttribute('href', `/admin/cleanup/rules/${DRY.id}`);
    await expect(page.getByTestId('admin-cleanup-turn-on-preview-link')).toHaveAttribute('href', `/admin/cleanup/rules/${DRY.id}`);

    const rows = page.getByTestId('admin-cleanup-turn-on-largest').getByRole('row');
    expect(await rows.count()).toBeGreaterThan(1);
    expect(await rows.count()).toBeLessThanOrEqual(11);
    const why = page.getByTestId('admin-cleanup-turn-on-largest').getByRole('button', { name: /^Why: / }).first();
    await expect(why).toHaveAttribute('data-testid', /^admin-cleanup-turn-on-largest-movie:.+-why$/);
    const sheet = page.getByTestId('admin-cleanup-why');
    await expect(async () => {
      await why.click();
      await expect(sheet).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(page.getByTestId('admin-cleanup-why-summary')).toBeVisible();
    await page.getByTestId('admin-cleanup-why-close').click();
    await expect(sheet).toBeHidden();
    await expect(why).toBeFocused();
  });

  test('at 1440 x 900 the side column shows both cards, the button and its note whole, without an inner scroll (UX 4.6)', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTurnOn(page, DRY.id);
    const side = page.getByTestId('admin-cleanup-turn-on-side');
    await expect(side).toBeVisible();
    // The column itself never scrolls: nothing of the button's card is cut off
    expect(await side.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const column = await side.boundingBox();
    for (const id of ['admin-cleanup-turn-on-confirm', 'admin-cleanup-turn-on-confirm-note', 'admin-cleanup-turn-on-cancel']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(Boolean(column && box && box.y >= column.y && box.y + box.height <= column.y + column.height + 1)).toBe(true);
    }
  });

  test('Automatic reasons: the first batch above 10 % and a live rule with no dry run', async ({ adminPage: page }) => {
    await openTurnOn(page, DRY.id, 'automatic');

    const automatic = radio(page, /^Automatic$/);
    await expect(automatic).toHaveAttribute('aria-disabled', 'true');
    await expect(automatic).toHaveAccessibleDescription(/^Not for this first batch, because it is more than 10 % of the movies checked \(\d+ of \d+\)\. After the first batch, change the mode\.$/);
    await expect(radio(page, /^Review first/)).toBeChecked();

    await openTurnOn(page, REVIEW.id);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Change the mode of ${REVIEW.name}`);
    await expect(radio(page, /^Automatic$/)).toHaveAccessibleDescription('Needs one finished dry run.');
    await expect(page.getByTestId('admin-cleanup-turn-on-check-dry-runs')).toHaveText('No finished dry run yet. Automatic needs one.');
    await expect(page.getByTestId('admin-cleanup-turn-on-headline')).toHaveText(/^\d+ movies are in Leaving soon\. Their leave dates do not change\.$/);
    await expect(confirm(page)).toHaveAccessibleName('Switch to Review first');
    await expect(confirm(page)).toHaveAttribute('aria-disabled', 'true');
  });

  test('Change mode to Automatic above 50 titles asks for the typed count', async ({ adminPage: page }) => {
    await giveReviewRuleDryRuns();
    await openTurnOn(page, REVIEW.id, 'automatic');

    await expect(radio(page, /^Automatic$/)).toBeChecked();
    await expect(confirm(page)).toHaveAccessibleName('Switch to Automatic');
    const count = Number(await typedCount(page));
    expect(count).toBeGreaterThan(50);
    await expect(page.getByRole('textbox', { name: `Type ${count} to turn on Automatic` })).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByTestId('admin-cleanup-turn-on-confirm-note')).toHaveText(
      'At the leave date: Automatic. Radarr deletes the movies and their files, and adds an import list exclusion for each, inside the daily budget.'
    );
    await expect(page.getByTestId('admin-cleanup-turn-on-due')).toHaveText(/^\d+ movies are due\. Automatic deletes them at the next nightly run, inside the budget\.$/);

    await radio(page, /^Review first/).click();
    await expect(page.getByTestId('admin-cleanup-turn-on-typed')).toHaveCount(0);
    await expect(page.getByTestId('admin-cleanup-turn-on-confirm-note')).toHaveText('At the leave date: Review first. Nothing is deleted until you approve.');
    // Without the job queue its reason comes first
    if (process.env.REDIS_URL) await expect(confirm(page)).toHaveAccessibleDescription(/^This rule is already in Review first\./);
  });

  test('feature off: the check names its fix, and Open settings carries returnTo', async ({ adminPage: page }) => {
    await setFeature(false);
    try {
      await openTurnOn(page, DRY.id);
      const check = page.getByTestId('admin-cleanup-turn-on-check-feature-on');
      await expect(check).toHaveAttribute('data-state', 'failed');
      await expect(check).toContainText('Media cleanup is off. Turn it on in Settings first.');
      await expect(confirm(page)).toHaveAttribute('aria-disabled', 'true');
      if (process.env.REDIS_URL) await expect(confirm(page)).toHaveAccessibleDescription(/^Media cleanup is off\. Turn it on in Settings first\./);
      await expect(page.getByTestId('admin-cleanup-turn-on-top-check-feature-on')).toBeHidden();

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId('admin-cleanup-turn-on-top-check-feature-on')).toBeVisible();
      await expect(page.getByTestId('admin-cleanup-turn-on-top-check-feature-on-fix')).toHaveText('Open settings');

      await page.setViewportSize({ width: 1440, height: 900 });
      const returnTo = encodeURIComponent(turnOnPath(DRY.id));
      await expect(page.getByTestId('admin-cleanup-turn-on-settings-link')).toHaveAttribute(
        'href',
        `/admin/cleanup?tab=settings&section=cleanup-feature&returnTo=${returnTo}`
      );
      await page.getByTestId('admin-cleanup-turn-on-settings-link').click();
      await expect(page).toHaveURL((url) => url.pathname === '/admin/cleanup' && url.searchParams.get('tab') === 'settings' &&
        url.searchParams.get('section') === 'cleanup-feature' && url.searchParams.get('returnTo') === turnOnPath(DRY.id));
    } finally {
      await setFeature(true);
    }
  });

  test('Back to Turn on {rule} @needs-settings', async ({ adminPage: page }) => {
    await setFeature(false);
    try {
      await page.goto(`/admin/cleanup?tab=settings&section=cleanup-feature&returnTo=${encodeURIComponent(turnOnPath(DRY.id))}`);
      await expect(page.getByTestId('settings-cleanup-feature-form')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await page.getByTestId('cleanup-feature-enabled').check();
      await page.getByTestId('settings-cleanup-feature-save').click();
      const back = page.getByTestId('admin-cleanup-settings-return');
      await expect(back).toHaveText(`Back to Turn on ${DRY.name}`);
      await back.click();
      await expect(page).toHaveURL(new RegExp(`${turnOnPath(DRY.id)}$`));
      await expect(page.getByTestId('admin-cleanup-turn-on-check-feature-on')).toHaveText('Media cleanup is on.');
    } finally {
      await setFeature(true);
    }
  });

  test('screenshots at 1440 and 390 wide', async ({ adminPage: page }) => {
    const dir = process.env.CLEANUP_SHOTS_DIR;
    test.skip(!dir, 'Set CLEANUP_SHOTS_DIR to write the screenshots');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTurnOn(page, DRY.id);
    await page.screenshot({ path: `${dir}/turn-on-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await openTurnOn(page, REVIEW.id, 'automatic');
    await page.screenshot({ path: `${dir}/change-mode-390.png`, fullPage: true });
    await openTurnOn(page, DRY.id);
    await page.screenshot({ path: `${dir}/turn-on-390.png`, fullPage: true });
  });

  // The cases below press "Turn on". Each seeds again first: two of them turn a rule on (delivery-r7-1, delivery-r8-2).

  test('stale numbers: the press adds nothing, shows the changed alert and clears the typed count', async ({ adminPage: page }) => {
    test.skip(!process.env.REDIS_URL, NEEDS_QUEUE);
    await seedCleanup(PREFIX);
    await giveReviewRuleDryRuns();
    await openTurnOn(page, REVIEW.id, 'automatic');
    const field = page.getByTestId('admin-cleanup-turn-on-typed');
    await field.fill(await typedCount(page));
    const before = await ruleRow(REVIEW.id);

    // A save while the page shows: the rule revision moves on
    const prisma = createE2EPrismaClient();
    try {
      await prisma.cleanupRule.update({ where: { id: REVIEW.id }, data: { revision: { increment: 1 } } });
    } finally {
      await prisma.$disconnect();
    }
    await confirm(page).click();

    await expect(page.getByTestId('admin-cleanup-turn-on-changed')).toContainText('The numbers changed. Check them again.');
    await expect(page.getByTestId('admin-cleanup-turn-on-changed')).toHaveAttribute('role', 'alert');
    await expect(field).toHaveValue('');
    expect((await ruleRow(REVIEW.id)).mode).toBe(before.mode);
  });

  test('stale numbers after a save in another tab @needs-editor', async ({ adminPage: page }) => {
    test.skip(!process.env.REDIS_URL, NEEDS_QUEUE);
    await seedCleanup(PREFIX);
    await openTurnOn(page, DRY.id);

    const other = await page.context().newPage();
    await other.goto(`/admin/cleanup/rules/${DRY.id}`);
    await expect(async () => {
      await other.getByTestId('admin-cleanup-editor-rename').click();
      await expect(other.getByTestId('admin-cleanup-editor-rename-input')).toBeVisible({ timeout: 1000 });
    }).toPass();
    await other.getByTestId('admin-cleanup-editor-rename-input').fill(`${DRY.name} again`);
    await other.getByTestId('admin-cleanup-editor-rename-save').click();
    await expect(other.getByRole('heading', { level: 1 })).toContainText(`${DRY.name} again`);
    // A rename changes the draft only: Save writes it, and the rule revision moves on
    const saved = await ruleRow(DRY.id);
    await other.getByTestId('admin-cleanup-editor-save').click();
    await expect.poll(async () => (await ruleRow(DRY.id)).revision, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT }).toBe(saved.revision + 1);
    await other.close();

    await confirm(page).click();
    await expect(page.getByTestId('admin-cleanup-turn-on-changed')).toContainText('The numbers changed. Check them again.');
    expect((await ruleRow(DRY.id)).mode).toBe('dryRun');
  });

  test('typed approval: Automatic above 50 titles turns on only with the typed count', async ({ adminPage: page }) => {
    test.skip(!process.env.REDIS_URL, NEEDS_QUEUE);
    await seedCleanup(PREFIX);
    await giveReviewRuleDryRuns();
    await openTurnOn(page, REVIEW.id, 'automatic');
    const count = await typedCount(page);

    await page.getByTestId('admin-cleanup-turn-on-typed').fill(String(Number(count) - 1));
    await expect(confirm(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(confirm(page)).toHaveAccessibleDescription(new RegExp(`^Type ${count} to turn on Automatic\\.`));
    await page.getByTestId('admin-cleanup-turn-on-typed').fill(count);
    await expect(confirm(page)).toHaveAttribute('aria-disabled', 'false');
    await confirm(page).click();

    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${REVIEW.id}$`), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByText('Mode changed')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    expect((await ruleRow(REVIEW.id)).mode).toBe('automatic');
  });

  test('Success opens the rule page with the toast @needs-editor', async ({ adminPage: page }) => {
    test.skip(!process.env.REDIS_URL, NEEDS_QUEUE);
    await seedCleanup(PREFIX);
    await openTurnOn(page, DRY.id);
    await expect(confirm(page)).toHaveAttribute('aria-disabled', 'false');
    await confirm(page).click();

    await expect(page).toHaveURL(new RegExp(`/admin/cleanup/rules/${DRY.id}$`), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByText('Rule turned on')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(page.getByTestId('admin-cleanup-editor-mode')).toContainText('Review first');
    expect((await ruleRow(DRY.id)).mode).toBe('reviewFirst');
  });
});
