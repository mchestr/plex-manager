import type { InactivitySettings } from '../../lib/generated/prisma/client';
import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { editSection } from '../helpers/settings';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';
import { MOCK_USERS_TABLE } from '../mocks/tautulli-server';

/**
 * Inactive members (`/admin/inactivity`), under Community: the settings card
 * opens read-only and saves through Edit; Run now reads last seen from the
 * mock Tautulli (`e2e/mocks/tautulli-server.ts`, `get_users_table`) and each
 * member page shows what the read found; while automatic removal is on and
 * the preview lists a member, Run now first asks to confirm the count; and a
 * member page's switch keeps a member out of the sweep.
 *
 * Automatic removal stays off, except in the confirm test, which turns it on
 * in the settings row, closes the dialog without confirming and turns it off
 * again. The run in the Run now test is queued, so the spec waits for its
 * row. afterAll deletes every row the file made and puts the settings back.
 */

const P = 'e2e-inactivity';
const DAY = 24 * 60 * 60 * 1000;
const TAUTULLI_ID = `${P}-tautulli`;
const MEMBERS = {
  played: { id: `${P}-played`, name: 'Aaa Inactivity Played', plexUserId: String(MOCK_USERS_TABLE.played.userId) },
  neverPlayed: { id: `${P}-never`, name: 'Aaa Inactivity Never', plexUserId: String(MOCK_USERS_TABLE.neverPlayed.userId) },
  noHistory: { id: `${P}-no-history`, name: 'Aaa Inactivity No History', plexUserId: String(MOCK_USERS_TABLE.noHistory.userId) },
  /** Not in the mock's users: only the confirm test's own read finds them. */
  inactive: { id: `${P}-inactive`, name: 'Aaa Inactivity Inactive', plexUserId: '9300004' },
} as const;
const READ_RUN_ID = `${P}-read`;

/** When the file started: the runs and audit rows its runs and saves write come after it. */
const SINCE = new Date();
let saved: Pick<InactivitySettings, 'enabled' | 'thresholdDays'> | null = null;

function tautulliUrl(): string {
  const url = process.env.E2E_TAUTULLI_URL;
  if (!url) throw new Error('E2E_TAUTULLI_URL is unset: e2e/global-setup.ts starts the mock Tautulli server');
  return url;
}

async function setRemoval(enabled: boolean, thresholdDays = 180) {
  const prisma = createE2EPrismaClient();
  try {
    const values = { enabled, thresholdDays };
    await prisma.inactivitySettings.upsert({ where: { id: 'inactivity' }, create: { id: 'inactivity', ...values }, update: values });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Admin inactive members', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      saved = await prisma.inactivitySettings.findUnique({ where: { id: 'inactivity' }, select: { enabled: true, thresholdDays: true } });
      // The newest active row, so the read uses the mock
      const tautulli = { name: 'E2E Tautulli', url: tautulliUrl(), apiKey: 'e2e-tautulli-key', isActive: true };
      await prisma.tautulli.upsert({ where: { id: TAUTULLI_ID }, create: { id: TAUTULLI_ID, ...tautulli }, update: tautulli });
      await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
      for (const member of Object.values(MEMBERS)) {
        await prisma.user.create({
          data: {
            ...member,
            email: `${member.id}@example.com`,
            primaryAuthService: 'plex',
            onboardingStatus: { plex: true, jellyfin: false },
            createdAt: new Date(Date.now() - 400 * DAY),
          },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
    await setRemoval(false);
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
      await prisma.tautulli.deleteMany({ where: { id: TAUTULLI_ID } });
      await prisma.inactivityRun.deleteMany({ where: { OR: [{ id: READ_RUN_ID }, { startedAt: { gte: SINCE } }] } });
      await prisma.auditLog.deleteMany({
        where: {
          type: { in: ['INACTIVITY_SETTINGS_CHANGED', 'ACTIVITY_SYNC_TRIGGERED', 'INACTIVITY_SWEEP_RUN', 'INACTIVITY_EXCLUSION_CHANGED'] },
          createdAt: { gte: SINCE },
        },
      });
      if (saved) await prisma.inactivitySettings.update({ where: { id: 'inactivity' }, data: saved });
      else await prisma.inactivitySettings.deleteMany({ where: { id: 'inactivity' } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('the sidebar reaches it under Community', async ({ adminPage: page }) => {
    await page.goto('/admin');
    const link = page.getByTestId('admin-sidebar').getByTestId('admin-nav-inactivity').first();
    await link.click();
    await expect(page).toHaveURL(/\/admin\/inactivity$/);
    await expect(page.getByTestId('admin-inactivity-header')).toContainText('Inactive members');
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('the settings card shows the saved settings, and saves new days through Edit', async ({ adminPage: page }) => {
    await page.goto('/admin/inactivity');
    await expect(page.getByTestId('settings-inactivity-summary-enabled')).toContainText('Off');
    await expect(page.getByTestId('settings-inactivity-summary-threshold')).toContainText('180 days without a play');

    await editSection(page, 'inactivity');
    await expect(page.getByTestId('admin-inactivity-enabled-toggle')).toBeFocused();
    await page.getByTestId('admin-inactivity-days-input').fill('365');
    await page.getByTestId('settings-inactivity-save').click();

    await expect(page.getByTestId('settings-inactivity-summary-threshold')).toContainText('365 days without a play');
    await expect(page.getByTestId('settings-inactivity-summary-enabled')).toContainText('Off');
    await expect(page.getByTestId('settings-inactivity-edit')).toBeFocused();
    // The audit row behind "Last saved" is written beside the save, so a reload may come first
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('settings-inactivity-last-saved')).toContainText(`by ${TEST_USERS.ADMIN.name}`, { timeout: 1000 });
    }).toPass({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

    const prisma = createE2EPrismaClient();
    try {
      expect(await prisma.inactivitySettings.findUnique({ where: { id: 'inactivity' } })).toMatchObject({ enabled: false, thresholdDays: 365 });
    } finally {
      await prisma.$disconnect();
    }
    await setRemoval(false);
  });

  test('Run now reads last seen from Tautulli, and each member page shows what it found', async ({ adminPage: page }) => {
    const clickedAt = new Date();
    await page.goto('/admin/inactivity');
    await expect(page.getByTestId('admin-inactivity-last-run')).toBeVisible();
    await page.getByTestId('admin-inactivity-run-now').click();
    await expect(page.getByTestId('toast').filter({ hasText: /Run (queued|finished)/ })).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

    // The run is a job on the worker: wait for its row to finish
    const prisma = createE2EPrismaClient();
    let runId: string | undefined;
    try {
      await expect
        .poll(
          async () => {
            const run = await prisma.inactivityRun.findFirst({
              where: { startedAt: { gte: clickedAt }, finishedAt: { not: null } },
              select: { id: true },
            });
            runId = run?.id;
            return runId;
          },
          { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION }
        )
        .toBeDefined();
    } finally {
      await prisma.$disconnect();
    }

    await page.reload();
    await expect(page.getByTestId(`admin-inactivity-runs-row-${runId}`)).toContainText('Automatic removal is off');
    await expect(page.getByTestId(`admin-inactivity-run-${runId}`)).toHaveAttribute('href', `/admin/audit?run=${runId}`);
    await expect(page.getByTestId('admin-inactivity-last-run')).toContainText('Run by an admin');

    await page.goto(`/admin/users/${MEMBERS.played.id}`);
    await expect(page.getByTestId('admin-user-last-seen-timestamp')).toContainText('Mar 3, 2026');
    await page.goto(`/admin/users/${MEMBERS.neverPlayed.id}`);
    await expect(page.getByTestId('admin-user-last-seen')).toHaveText('Never');
    // Tautulli keeps no history for them, so the read does not count them as read
    await page.goto(`/admin/users/${MEMBERS.noHistory.id}`);
    await expect(page.getByTestId('admin-user-last-seen')).toContainText('Unknown');
  });

  test('while removal is on, Run now asks to confirm the members the preview lists', async ({ adminPage: page }) => {
    const prisma = createE2EPrismaClient();
    const readAt = new Date();
    try {
      // A newer read than any run so far, which found only this member
      const read = { trigger: 'admin', startedAt: readAt, finishedAt: readAt, error: null, entries: [] };
      await prisma.inactivityRun.upsert({ where: { id: READ_RUN_ID }, create: { id: READ_RUN_ID, ...read }, update: read });
      await prisma.user.update({ where: { id: MEMBERS.inactive.id }, data: { lastSeenReadAt: readAt } });
      await setRemoval(true);

      await page.goto('/admin/inactivity');
      await expect(page.getByTestId(`admin-inactivity-member-${MEMBERS.inactive.id}`)).toHaveAttribute('href', `/admin/users/${MEMBERS.inactive.id}`);

      // Opening the confirm changes nothing, so a click before hydration is simply made again
      const dialog = page.getByTestId('admin-inactivity-run-dialog');
      await expect(async () => {
        if (!(await dialog.isVisible())) await page.getByTestId('admin-inactivity-run-now').click();
        await expect(dialog).toBeVisible({ timeout: 1000 });
      }).toPass();
      await expect(dialog).toContainText('Remove Plex access from 1 member now?');
      await expect(page.getByTestId('admin-inactivity-run-confirm')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      expect(await prisma.inactivityRun.count({ where: { startedAt: { gt: readAt } } })).toBe(0);
    } finally {
      await setRemoval(false);
      await prisma.$disconnect();
    }
  });

  test("a member page's switch keeps the member out of the sweep", async ({ adminPage: page }) => {
    await page.goto(`/admin/users/${MEMBERS.inactive.id}`);
    const toggle = page.getByTestId('admin-user-inactivity-excluded');
    await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await page.reload();
    await expect(page.getByTestId('admin-user-inactivity-excluded')).toHaveAttribute('aria-checked', 'true', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await page.goto('/admin/inactivity');
    await expect(page.getByTestId('admin-inactivity-not-listed-excluded')).toContainText('Excluded by an admin');
    await expect(page.getByTestId(`admin-inactivity-member-${MEMBERS.inactive.id}`)).toHaveCount(0);
  });
});
