import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/session';
import { CLEANUP_MEMBERS, type CleanupWorld, movieKey, showKey, worldItem } from './helpers/cleanup-fixtures';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearCleanup, restorePlex, seedCleanup, useCleanupPlex, useUnreachablePlex, wipeCleanup } from './helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The member side of media cleanup (TS 16.4, UX 9): signed in as
 * `e2e-cleanup-member`, the nav item, the date groups and the Show control,
 * For you reasons, Keep with Undo, End keep, the Keep limit, the Home row
 * and Account Keeps. `e2e-cleanup-noshare` sees the empty state and no nav
 * item, `e2e-cleanup-filtered` sees only titles without the label of its
 * share filter, and while the Plex server does not answer the page shows the
 * warning and the nav item hides (delivery-r3-1).
 *
 * Every case reads the share list through the plex.tv mock, so the spec
 * points the Plex row at the Plex mock first (`useCleanupPlex()`). Each Keep
 * that a case makes ends or is undone in the same case.
 *
 * With `CLEANUP_SHOTS_DIR` set, the page, Home and Account are saved at
 * 1440 x 900 and 390 x 844 for the comparison with the mockups.
 */

const SHOTS = process.env.CLEANUP_SHOTS_DIR;
const MEMBER = CLEANUP_MEMBERS.member.id;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The item key as test ids carry it (UX 10.1). */
const tid = (key: string) => key.replaceAll(':', '-');
const toast = (page: Page, text: string | RegExp) => page.getByTestId('toast').filter({ hasText: text }).first();

let world: CleanupWorld;
/** The leave day of each seeded item, by item key. */
let leaveOn: Map<string, string>;

async function open(page: Page, path: '/leaving-soon' | '/' | '/account', ready: string) {
  await page.goto(path);
  await expect(page.getByTestId(ready)).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
}

/** Presses Keep and waits for "Kept by you". A server-rendered button can need a second press until hydration. */
async function pressKeep(page: Page, base: string) {
  const end = page.getByTestId(`${base}-end-keep`);
  await expect(async () => {
    if (await end.isVisible()) return;
    await page.getByTestId(`${base}-keep`).click({ timeout: 1000 });
    await expect(end).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
}

/** Opens every card of a date group, if it has more than it shows. */
async function showAll(page: Page, group: string) {
  const button = page.getByTestId(`leaving-soon-group-${group}-show-all`);
  if (await button.isVisible()) {
    await expect(async () => {
      if (!(await button.isVisible())) return;
      await button.click({ timeout: 1000 });
      await expect(button).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  }
}

async function setKeepLimit(limit: number | null) {
  const prisma = createE2EPrismaClient();
  try {
    const members = limit === null ? {} : { members: { keepsEnabled: true, keepDays: 90, keepLimit: limit, pageEnabled: true } };
    await prisma.cleanupSettings.update({ where: { id: 'cleanup' }, data: { options: members } });
  } finally {
    await prisma.$disconnect();
  }
}

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

test.describe('Member Leaving soon', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const seeded = await seedCleanup();
    world = seeded.world;
    leaveOn = new Map(seeded.rows.items.flatMap((item) => (typeof item.leaveOn === 'string' ? [[item.itemKey, item.leaveOn]] : [])));
    await useCleanupPlex();
  });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
    await restorePlex();
  });

  test('shows the nav item, the date groups and the Show control', async ({ page, signIn }) => {
    await signIn(MEMBER);
    await open(page, '/', 'home-greeting');
    const nav = page.getByTestId('member-nav-leaving-soon');
    await expect(nav).toBeVisible();
    await nav.click();
    await expect(page).toHaveURL(/\/leaving-soon$/);
    await expect(page.getByTestId('leaving-soon-heading')).toHaveText('Leaving soon', { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
    await expect(nav).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('leaving-soon-page')).toContainText(/These titles leave .+ on the date shown\. If you still want to watch one, keep it\. A kept title stays for 90 days\./);
    await expect(page.getByTestId('leaving-soon-keep-meter')).toContainText('1 of 20 Keeps used');

    // The due group first, then each leave day, the soonest first
    const groups = page.locator('[data-testid^="leaving-soon-group-"]:not([data-testid$="-show-all"])');
    const ids = await groups.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')?.replace('leaving-soon-group-', '')));
    expect(ids[0]).toBe('due');
    expect(ids.slice(1).every((id) => DAY_RE.test(id ?? ''))).toBe(true);
    expect([...ids.slice(1)].sort()).toEqual(ids.slice(1));
    await expect(page.getByTestId('leaving-soon-group-due')).toContainText('These reached their leave date. They can still be kept.');

    // The due group shows 6 cards, then every card after Show all
    const due = page.getByTestId('leaving-soon-group-due');
    await expect(due.getByRole('article')).toHaveCount(6);
    await expect(page.getByTestId('leaving-soon-group-due-show-all')).toContainText(/Show all \d+/);
    await showAll(page, 'due');
    expect(await due.getByRole('article').count()).toBeGreaterThan(6);

    // The Everything line uses the N of All; Movies leaves out the seasons of the running show
    const all = Number((await page.getByTestId('leaving-soon-filter-all').textContent())?.replace(/\D/g, ''));
    await expect(page.getByTestId('leaving-soon-everything')).toContainText(`${all} more titles, the soonest first.`);
    const seasonKey = showKey(world, 'auto-a', 1);
    const seasonDay = leaveOn.get(seasonKey) ?? '';
    await expect(page.getByTestId(`leaving-soon-card-${tid(seasonKey)}`)).toBeVisible();
    await page.getByTestId('leaving-soon-filter-movies').click();
    await expect(page.getByTestId(`leaving-soon-group-${seasonDay}`)).toHaveCount(0);
    await page.getByTestId('leaving-soon-filter-shows').click();
    await expect(page.getByTestId(`leaving-soon-card-${tid(seasonKey)}`)).toBeVisible();
    await expect(page.getByTestId(`leaving-soon-card-${tid(movieKey(world, 'later-a'))}`)).toHaveCount(0);
    await page.getByTestId('leaving-soon-filter-all').click();
    await expect(page.getByTestId(`leaving-soon-card-${tid(movieKey(world, 'later-a'))}`)).toContainText(/Leaves [A-Z][a-z]{2} \d{1,2}/);
  });

  test('gives For you its reasons, and does not repeat those titles below', async ({ page, signIn }) => {
    await signIn(MEMBER);
    await open(page, '/leaving-soon', 'leaving-soon-for-you');
    const reasons: [string, string][] = [
      [movieKey(world, 'batch-03'), 'You requested this'],
      [movieKey(world, 'batch-02'), 'You started this'],
      [movieKey(world, 'batch-01'), 'You played this before'],
    ];
    await showAll(page, 'due');
    for (const [key, reason] of reasons) {
      const card = page.getByTestId(`leaving-soon-for-you-${tid(key)}`);
      await expect(card).toContainText(reason);
      await expect(card).toContainText(/Your request was in|You stopped part-way in|Your last play was/);
      await expect(page.getByTestId(`leaving-soon-card-${tid(key)}`)).toHaveCount(0);
    }
    // Member markup holds no size and no rule name
    const text = (await page.getByTestId('leaving-soon-page').textContent()) ?? '';
    expect(text).not.toMatch(/\b\d+(\.\d+)? ?(GB|TB|MB)\b/);
    expect(text).not.toContain('Old movies to review');
  });

  test('keeps a title at once, with Undo in the toast', async ({ page, signIn }) => {
    await signIn(MEMBER);
    await open(page, '/leaving-soon', 'leaving-soon-page');
    const key = movieKey(world, 'later-a');
    const base = `leaving-soon-card-${tid(key)}`;
    const title = worldItem(world, key).title;
    await expect(page.getByTestId(`${base}-keep`)).toHaveAccessibleName(`Keep ${title}`);

    await pressKeep(page, base);
    const card = page.getByTestId(base);
    await expect(card).toContainText('Kept by you');
    await expect(page.getByTestId(`${base}-end-keep`)).toBeFocused();
    await expect(page.getByTestId('leaving-soon-keep-meter')).toContainText('2 of 20 Keeps used');
    await shoot(page, 'member-leaving-soon');

    const kept = toast(page, `Kept ${title} until`);
    await expect(kept).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await kept.getByTestId('toast-action').click();
    await expect(page.getByTestId(`${base}-keep`)).toBeFocused({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(toast(page, /Keep undone|Keep ended/)).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

    // Undo put the title back with its leave date
    await open(page, '/leaving-soon', 'leaving-soon-page');
    await expect(page.getByTestId(base)).toContainText(/Leaves [A-Z][a-z]{2} \d{1,2}/);
    await expect(page.getByTestId('leaving-soon-keep-meter')).toContainText('1 of 20 Keeps used');
  });

  test('ends a Keep from Your Keeps, and shows a Keep that the server admin ended', async ({ page, signIn }) => {
    await signIn(MEMBER);
    await open(page, '/leaving-soon', 'leaving-soon-page');
    const key = movieKey(world, 'later-b');
    const title = worldItem(world, key).title;
    await pressKeep(page, `leaving-soon-card-${tid(key)}`);
    // The card shows the Keep before the server answers: wait for the answer before the reload
    await expect(toast(page, `Kept ${title} until`)).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

    // After a reload the kept title shows only under Your Keeps
    await open(page, '/leaving-soon', 'leaving-soon-my-keeps');
    await expect(page.getByTestId(`leaving-soon-card-${tid(key)}`)).toHaveCount(0);
    const mine = page.getByTestId('leaving-soon-my-keeps');
    await expect(mine).toContainText(title);
    await expect(mine).toContainText(`Your Keep ended. The server admin ended it on`);

    await page.getByTestId('leaving-soon-keeps-link').click();
    await expect(page.getByTestId('leaving-soon-my-keeps-heading')).toBeFocused();

    await mine.getByRole('button', { name: `End keep on ${title}` }).click();
    await expect(page.getByTestId('leaving-soon-end-keep-dialog')).toContainText(`End your Keep on ${title}?`);
    await page.getByTestId('leaving-soon-end-keep-confirm').click();
    await expect(toast(page, 'Keep ended')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(mine.getByRole('listitem').filter({ hasText: title })).toHaveCount(0);
  });

  test('disables every Keep at the limit, with the reason', async ({ page, signIn }) => {
    await setKeepLimit(1);
    try {
      await signIn(MEMBER);
      await open(page, '/leaving-soon', 'leaving-soon-keep-limit');
      await expect(page.getByTestId('leaving-soon-keep-meter')).toContainText('1 of 1 Keeps used');
      await expect(page.getByTestId('leaving-soon-keep-limit')).toHaveText('You keep 1 title. End a Keep to keep another.');
      const base = `leaving-soon-card-${tid(movieKey(world, 'later-a'))}`;
      await expect(page.getByTestId(`${base}-keep`)).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId(`${base}-limit`)).toHaveText('You keep 1 title. End a Keep to keep this one.');
    } finally {
      await setKeepLimit(null);
    }
  });

  test('shows the Home row with Keep, Kept by you and End keep', async ({ page, signIn }) => {
    await signIn(MEMBER);
    await open(page, '/', 'home-leaving-soon-row');
    const row = page.getByTestId('home-leaving-soon-row');
    await expect(row.getByRole('heading', { level: 2 })).toContainText(/^Leaving soon on .+/);
    await expect(row).toContainText(/\d+ titles leave soon\. The \d+ for you come first\. Keep one to watch it later\./);
    const items = page.getByTestId('home-leaving-soon-list').getByRole('listitem');
    await expect(items).toHaveCount(12);
    await expect(items.first()).toHaveAttribute('data-testid', /^home-leaving-soon-item-/);
    await shoot(page, 'member-home');

    // A title after the For you ones
    const base = (await items.nth(8).getAttribute('data-testid')) ?? '';
    await pressKeep(page, base);
    await expect(page.getByTestId(base)).toContainText('Kept by you');
    await expect(page.getByTestId(`${base}-end-keep`)).toBeFocused();
    const kept = toast(page, /^Kept .+ until/);
    await expect(kept).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await kept.getByTestId('toast-action').click();
    await expect(page.getByTestId(`${base}-keep`)).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

    await page.getByTestId('home-leaving-soon-see-all').click();
    await expect(page).toHaveURL(/\/leaving-soon$/);
  });

  test('lists Account Keeps with the one the server admin ended', async ({ page, signIn }) => {
    await signIn(MEMBER);
    await open(page, '/account', 'account-keeps');
    const keeps = page.getByTestId('account-keeps');
    await expect(keeps).toContainText('Titles you kept from Leaving soon. Each one stays until its date. You keep 1 of 20.');
    await expect(page.getByTestId('account-keeps-table')).toContainText(worldItem(world, movieKey(world, 'kept')).title);
    await expect(page.getByTestId('account-keeps-table')).toContainText('Ended by the server admin on');
    await shoot(page, 'member-account-keeps');
  });

  test('shows only titles without the share filter label to the filtered member', async ({ page, signIn }) => {
    await signIn(CLEANUP_MEMBERS.filtered.id);
    await open(page, '/leaving-soon', 'leaving-soon-page');
    await showAll(page, 'due');
    // Every sixth batch movie carries the label that the filter hides
    for (const n of ['12', '18']) await expect(page.locator(`[data-testid$="-${tid(movieKey(world, `batch-${n}`))}"]`)).toHaveCount(0);
    for (const n of ['07', '11']) await expect(page.getByTestId(`leaving-soon-card-${tid(movieKey(world, `batch-${n}`))}`)).toBeVisible();
  });

  test('shows the empty state and no nav item to a member with no shared title', async ({ page, signIn }) => {
    await signIn(CLEANUP_MEMBERS.noshare.id);
    await open(page, '/leaving-soon', 'leaving-soon-empty');
    await expect(page.getByTestId('leaving-soon-empty')).toContainText('Nothing is leaving soon');
    await expect(page.getByTestId('member-nav-leaving-soon')).toHaveCount(0);
    await open(page, '/', 'home-greeting');
    await expect(page.getByTestId('home-leaving-soon-row')).toHaveCount(0);
  });

  test('shows the warning when the Plex server does not answer', async ({ page, signIn }) => {
    await useUnreachablePlex();
    try {
      await signIn(MEMBER);
      await open(page, '/leaving-soon', 'leaving-soon-plex-failed');
      await expect(page.getByTestId('leaving-soon-plex-failed')).toHaveText('Plex did not answer. Reload the page to try again.');
      await expect(page.getByTestId('leaving-soon-empty')).toHaveCount(0);
      await expect(page.getByTestId('member-nav-leaving-soon')).toHaveCount(0);
    } finally {
      await useCleanupPlex();
    }
  });
});
