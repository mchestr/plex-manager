import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearReportLimits } from './helpers/rate-limits';
import { WAIT_TIMEOUTS, waitForStablePage } from './helpers/test-utils';
import { MOCK_HISTORY_MEMBER } from './mocks/tautulli-server';

/**
 * Problem reports on `/report` (docs/problem-reports.md) for a member who
 * doesn't own the server: the share list comes from the plex.tv mock
 * (section 1 shared, section 2 not) and the titles from a stub Plex server.
 * The regular member reports a title from Find a title, the admin finds it
 * already reported and follows it, and the member cancels their report.
 * Then a member with plays in the Tautulli mock reports from Recently
 * watched, and the sheet asks about their player. Last, the admin closes
 * that report from Automations > Problem reports with a note, and the
 * member reads the note on `/report`.
 */

const SHARED = { ratingKey: '93001', section: 1, title: 'Harbour Lights', guid: 'plex://movie/e2e-harbour-lights' };
const UNSHARED = { ratingKey: '94001', section: 2, title: 'Harbour Nights', guid: 'plex://movie/e2e-harbour-nights' };
const MOVIES = [SHARED, UNSHARED];
const SETTINGS_ID = 'problem-reports';
const TAUTULLI_ID = 'e2e-reports-tautulli';
const HISTORY_MEMBER = { id: 'e2e-reports-history-member', plexUserId: String(MOCK_HISTORY_MEMBER.userId) };

const metadata = (movie: (typeof MOVIES)[number]) => ({
  ratingKey: movie.ratingKey,
  type: 'movie',
  title: movie.title,
  year: 2024,
  guid: movie.guid,
  librarySectionID: movie.section,
});

/** Answers identity, search and item metadata for the two movies; everything else is a 404. */
function startStubPlex(): Promise<Server> {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const json = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const item = MOVIES.find((movie) => pathname === `/library/metadata/${movie.ratingKey}`);
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="e2e-reports-machine" />');
    } else if (pathname === '/search') json({ MediaContainer: { size: MOVIES.length, Metadata: MOVIES.map(metadata) } });
    else if (item) json({ MediaContainer: { size: 1, librarySectionID: item.section, Metadata: [metadata(item)] } });
    else {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function withDb<T>(run: (prisma: ReturnType<typeof createE2EPrismaClient>) => Promise<T>): Promise<T> {
  const prisma = createE2EPrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Opens a confirm dialog once the page has settled: its trigger is
 * server-rendered before React hydrates it, and a click before then does
 * nothing, so click until the dialog shows.
 */
async function openDialog(page: Page, trigger: Locator, dialog: Locator): Promise<void> {
  await waitForStablePage(page);
  await expect(async () => {
    if (await dialog.isVisible()) return;
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
}

const clearReports = () => withDb((prisma) => prisma.problemReport.deleteMany({ where: { titleKey: { in: MOVIES.map((movie) => movie.guid) } } }));

test.describe('Problem reports', () => {
  let stub: Server;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    stub = await startStubPlex();
    await clearReports();
    await clearReportLimits();
    await withDb(async (prisma) => {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
      await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: `http://127.0.0.1:${(stub.address() as AddressInfo).port}` } });
      await prisma.problemReportSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, enabled: true }, update: { enabled: true } });
      const url = process.env.E2E_TAUTULLI_URL;
      if (!url) throw new Error('E2E_TAUTULLI_URL is unset: e2e/global-setup.ts starts the mock Tautulli server');
      const tautulli = { name: 'E2E Tautulli', url, apiKey: 'e2e-tautulli-key', isActive: true };
      await prisma.tautulli.upsert({ where: { id: TAUTULLI_ID }, create: { id: TAUTULLI_ID, ...tautulli }, update: tautulli });
      await prisma.user.upsert({
        where: { id: HISTORY_MEMBER.id },
        create: { ...HISTORY_MEMBER, name: 'History Member', email: 'history-member@example.com', primaryAuthService: 'plex', onboardingStatus: { plex: true } },
        update: {},
      });
    });
  });

  test.afterAll(async () => {
    await clearReports();
    await withDb(async (prisma) => {
      if (originalUrl) await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: originalUrl } });
      await prisma.problemReportSettings.deleteMany({ where: { id: SETTINGS_ID } });
      await prisma.tautulli.deleteMany({ where: { id: TAUTULLI_ID } });
      await prisma.user.deleteMany({ where: { id: HISTORY_MEMBER.id } });
    });
    await new Promise((resolve) => stub.close(resolve));
  });

  test('a member reports a title from Find a title', async ({ regularUserPage: page }) => {
    await page.goto('/report');
    await page.getByTestId('report-search-input').fill('harbour');
    await page.getByTestId('report-search-submit').click();

    await expect(page.getByTestId(`report-result-${SHARED.ratingKey}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId(`report-result-${UNSHARED.ratingKey}`)).toHaveCount(0);
    await page.getByTestId(`report-result-${SHARED.ratingKey}`).click();

    const sheet = page.getByTestId('report-sheet');
    await expect(sheet.getByTestId('report-sheet-title')).toHaveText(`${SHARED.title} (2024)`);
    await sheet.getByTestId('report-kind-playback').click();
    await sheet.getByTestId('report-problem-out_of_sync').click();
    await sheet.getByTestId('report-note').fill('The sound runs a second late');
    await sheet.getByTestId('report-send').click();
    await expect(sheet.getByTestId('report-sent')).toBeVisible();
    await sheet.getByTestId('report-done').click();

    await expect(page.getByTestId('report-sheet')).toHaveCount(0);
    const row = page.locator('[data-testid^="report-row-status-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('With the server admin');
  });

  test('a title with an open report says so, and another member follows it', async ({ adminPage: page }) => {
    await page.goto(`/report?item=${SHARED.ratingKey}`);

    const sheet = page.getByTestId('report-sheet');
    await expect(sheet.getByTestId('report-already-text')).toContainText('This title already has an open report: Sound is out of sync.', {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
    await sheet.getByTestId('report-follow').click();
    await expect(sheet.getByTestId('report-following')).toBeVisible();
    await sheet.getByTestId('report-already-done').click();

    await expect(page.locator('[data-testid^="report-row-latest-"]')).toContainText("You're following it");
  });

  test('the member cancels their report, and the title is free again', async ({ regularUserPage: page }) => {
    await page.goto('/report');
    await openDialog(page, page.locator('[data-testid^="report-cancel-"]'), page.getByTestId('report-cancel-dialog'));
    await page.getByTestId('report-cancel-confirm').click();

    await expect(page.locator('[data-testid^="report-row-status-"]')).toContainText('Closed');
    await expect(page.locator('[data-testid^="report-cancel-"]')).toHaveCount(0);

    await page.goto(`/report?item=${SHARED.ratingKey}`);
    await expect(page.getByTestId('report-sheet').getByTestId('report-kind-playback')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('a member reports a title from Recently watched, naming their player', async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await signInAs(context, baseURL ?? '', HISTORY_MEMBER.id);
    const page = await context.newPage();

    await page.goto('/report');
    await expect(page.getByTestId(`report-recent-title-${SHARED.ratingKey}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId(`report-recent-title-${UNSHARED.ratingKey}`)).toHaveCount(0);
    await page.getByTestId(`report-recent-title-${SHARED.ratingKey}`).click();

    const sheet = page.getByTestId('report-sheet');
    await sheet.getByTestId('report-kind-playback').click();
    await sheet.getByTestId('report-problem-wont_start').click();
    await expect(sheet.getByTestId('report-device-question')).toHaveText('Does anything else play on Living Room?');
    await sheet.getByTestId('report-device-others_play').click();
    await sheet.getByTestId('report-send').click();
    await expect(sheet.getByTestId('report-sent')).toBeVisible();

    await withDb(async (prisma) => {
      const event = await prisma.problemReportEvent.findFirstOrThrow({ where: { kind: 'REPORTED', actorUserId: HISTORY_MEMBER.id } });
      expect(event.data).toMatchObject({ problem: 'wont_start', device: 'others_play', evidence: { lastPlay: { player: 'Living Room', transcoded: false } } });
      expect(JSON.stringify(event.data)).not.toContain('10.0.0.9');
    });
    await context.close();
  });

  test('the admin closes the report with a note, and the member reads it on /report', async ({ adminPage: page, browser, baseURL }) => {
    const report = await withDb((prisma) =>
      prisma.problemReport.findFirstOrThrow({ where: { reporterId: HISTORY_MEMBER.id, status: 'WITH_ADMIN' }, select: { id: true } })
    );

    await page.goto('/admin/problem-reports');
    await expect(page.getByTestId(`admin-problem-reports-row-${report.id}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await page.getByTestId(`admin-problem-reports-link-${report.id}`).click();

    await expect(page.getByTestId('admin-problem-report-status')).toHaveText('With the server admin', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await openDialog(page, page.getByTestId('admin-problem-report-closed'), page.getByTestId('admin-problem-report-closed-dialog'));
    await page.getByTestId('admin-problem-report-closed-member-note').fill('This is the only copy we have. A better one comes out in March.');
    await page.getByTestId('admin-problem-report-closed-admin-note').fill('Checked every indexer');
    await page.getByTestId('admin-problem-report-closed-confirm').click();
    await expect(page.getByTestId('admin-problem-report-status')).toHaveText(/Closed/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-problem-report-closed')).toHaveCount(0);

    const context = await browser.newContext();
    await signInAs(context, baseURL ?? '', HISTORY_MEMBER.id);
    const member = await context.newPage();
    await member.goto('/report');
    await expect(member.getByTestId(`report-row-note-${report.id}`)).toContainText('This is the only copy we have. A better one comes out in March.', {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
    await expect(member.getByTestId(`report-row-status-${report.id}`)).toContainText('By the server admin');
    await expect(member.getByTestId('report-yours')).not.toContainText('Checked every indexer');
    await context.close();
  });
});
