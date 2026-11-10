import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Page } from '@playwright/test';
import { Queue } from 'bullmq';

import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
import { MOCK_MOVIE, startMockRadarr, type MockRadarr } from './mocks/radarr-server';

/**
 * Members' swaps (docs/problem-reports.md, "Members' swaps"): the admin
 * turns them On once Radarr keeps a recycle bin; a member watching a copy
 * that looks filmed off a screen swaps it from the sheet, the swap waits
 * until nobody plays the title, grabs another release, and the member then
 * says the new copy is still broken, which puts the report back with the
 * server admin; in Dry run the swap stops at its pick and goes to the server
 * admin while the member sees it with them throughout; and a member out of
 * swaps is told when one comes back. Radarr is the mock in
 * `e2e/mocks/radarr-server.ts`, and the movie and the member's stream come
 * from a stub Plex server in library section 1, which the plex.tv mock
 * shares with the regular member. A fix's next step waits in the job queue,
 * so the spec promotes the delayed job instead of waiting for it.
 */

const MOVIE = { ratingKey: '95101', title: 'Harbour Heist', guid: 'plex://movie/e2e-harbour-heist', folder: '/movies/Harbour Heist (2024)' };
const FILE_NAME = 'Harbour Heist (2024) Bluray-1080p.mkv';
const SETTINGS_ID = 'problem-reports';
const RADARR_ID = 'e2e-reports-radarr';
const QUEUE_NAME = 'plex-wrapped';
const TARGET = `radarr:movie:${MOCK_MOVIE.id}`;
const BAD = 'Harbour.Heist.2024.1080p.BluRay.x264-BAD';
const GOOD = 'Harbour.Heist.2024.1080p.BluRay.x264-GOOD';
const QUALITY = { quality: { id: 7, name: 'Bluray-1080p' }, revision: { version: 1, real: 0 } };
const EXISTING = ['Existing file on disk is of equal or higher preference: Bluray-1080p'];
const DAY_MS = 24 * 60 * 60 * 1000;
/** The regular member's stream of the movie, as `/status/sessions` lists it. */
const WATCHING = { ratingKey: MOVIE.ratingKey, type: 'movie', title: MOVIE.title, librarySectionID: '1', User: { id: 'regular-plex-id', title: 'regular' }, Player: { title: 'Living Room', state: 'playing' } };

type StubPlex = { server: Server; sessions: unknown[] };

/** Answers identity, the movie with its one file, and the streams a test sets; everything else is a 404. */
function startStubPlex(): Promise<StubPlex> {
  const stub: StubPlex = { server: undefined as never, sessions: [] };
  stub.server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const json = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="e2e-member-swap-machine" />');
    } else if (pathname === `/library/metadata/${MOVIE.ratingKey}`) {
      json({
        MediaContainer: {
          size: 1,
          librarySectionID: 1,
          Metadata: [
            {
              ratingKey: MOVIE.ratingKey,
              type: 'movie',
              title: MOVIE.title,
              year: 2024,
              guid: MOVIE.guid,
              librarySectionID: 1,
              Guid: [{ id: `tmdb://${MOCK_MOVIE.tmdbId}` }],
              Media: [{ Part: [{ file: `/data${MOVIE.folder}/${FILE_NAME}`, size: 4200 }] }],
            },
          ],
        },
      });
    } else if (pathname === '/status/sessions') {
      json({ MediaContainer: { size: stub.sessions.length, Metadata: stub.sessions } });
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => stub.server.listen(0, '127.0.0.1', () => resolve(stub)));
}

async function withDb<T>(run: (prisma: ReturnType<typeof createE2EPrismaClient>) => Promise<T>): Promise<T> {
  const prisma = createE2EPrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** The reports and the ledger rows their fixes wrote, so every limit counts from nothing in each test. */
const clearReports = () =>
  withDb((prisma) =>
    prisma.$transaction([
      prisma.problemFixLedger.deleteMany({ where: { target: TARGET } }),
      prisma.problemReport.deleteMany({ where: { titleKey: MOVIE.guid } }),
    ])
  );

/** Members' swaps in `mode`, changed a minute ago, with the default limits. */
const setMode = (automatic: 'OFF' | 'DRY_RUN' | 'ON') =>
  withDb((prisma) => {
    const data = { enabled: true, breakerTrippedAt: null, automatic, automaticSince: new Date(Date.now() - 60_000), weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10 };
    return prisma.problemReportSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  });

const reportOf = () => withDb((prisma) => prisma.problemReport.findFirstOrThrow({ where: { titleKey: MOVIE.guid }, select: { id: true } }));
const statusOf = (id: string) => withDb(async (prisma) => (await prisma.problemReport.findUniqueOrThrow({ where: { id }, select: { status: true } })).status);

/** Once the report's fix job has delayed itself for its next step, runs `then` with a way to run that step now. */
async function onceDelayed(reportId: string, then: (promote: () => Promise<void>) => Promise<void>) {
  const queue = new Queue(QUEUE_NAME, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
  try {
    const jobId = `problem-report-fix-${reportId}-1`;
    await expect.poll(async () => (await queue.getJob(jobId))?.getState(), { timeout: 30_000 }).toBe('delayed');
    await then(async () => {
      await (await queue.getJob(jobId))?.promote();
    });
  } finally {
    await queue.close();
  }
}

/** Runs the report's delayed fix job now, as if its wait were over. */
const runNextStep = (reportId: string) => onceDelayed(reportId, (promote) => promote());

/** Opens the movie's sheet and picks "Looks filmed off a screen", which a swap fixes without asking about the player. */
async function chooseFilmedOffScreen(page: Page) {
  await page.goto(`/report?item=${MOVIE.ratingKey}`);
  const sheet = page.getByTestId('report-sheet');
  await sheet.getByTestId('report-kind-picture').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  await sheet.getByTestId('report-problem-filmed_off_screen').click();
  return sheet;
}

test.describe("Problem reports: members' swaps", () => {
  let plex: StubPlex;
  let radarr: MockRadarr;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    [plex, radarr] = await Promise.all([startStubPlex(), startMockRadarr(MOVIE.folder)]);
    await clearReports();
    await withDb(async (prisma) => {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
      await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: `http://127.0.0.1:${(plex.server.address() as AddressInfo).port}` } });
      const row = { name: 'E2E Radarr', url: radarr.url, apiKey: 'e2e-radarr-key', isActive: true };
      await prisma.radarr.upsert({ where: { id: RADARR_ID }, create: { id: RADARR_ID, ...row }, update: row });
    });
  });

  test.afterAll(async () => {
    await clearReports();
    await withDb(async (prisma) => {
      if (originalUrl) await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: originalUrl } });
      await prisma.problemReportSettings.deleteMany({ where: { id: SETTINGS_ID } });
      await prisma.radarr.deleteMany({ where: { id: RADARR_ID } });
    });
    await Promise.all([new Promise((resolve) => plex.server.close(resolve)), radarr.close()]);
  });

  test.beforeEach(async () => {
    await clearReports();
    plex.sessions = [];
    radarr.file = { id: 70, relativePath: FILE_NAME, size: 4200, qualityCutoffNotMet: false, customFormatScore: 0, sceneName: BAD, quality: QUALITY, languages: [{ id: 1, name: 'English' }] };
    radarr.history = [
      { id: 41, eventType: 'grabbed', date: '2026-10-01T00:00:00Z', sourceTitle: BAD, downloadId: 'DL1', data: {} },
      { id: 42, eventType: 'downloadFolderImported', date: '2026-10-01T01:00:00Z', sourceTitle: BAD, downloadId: 'DL1', data: { fileId: '70' } },
    ];
    const release = (title: string, guid: string, seeders: number) => ({ guid, indexerId: 1, title, quality: QUALITY, customFormatScore: 0, rejected: true, rejections: EXISTING, languages: [{ id: 1, name: 'English' }], seeders });
    radarr.releases = [release(BAD, 'guid-bad', 50), release(GOOD, 'guid-good', 20)];
    radarr.recycleBin = true;
    for (const recorded of [radarr.commands, radarr.grabs, radarr.failed, radarr.blocklist, radarr.deleted, radarr.edits]) recorded.length = 0;
  });

  test("the admin turns members' swaps On once Radarr keeps a recycle bin", async ({ adminPage: page }) => {
    await setMode('OFF');
    radarr.recycleBin = false;

    await page.goto('/admin/problem-reports');
    await page.getByTestId('settings-problem-reports-edit').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-problem-reports-recycle-bin')).toContainText('On needs a recycle bin in Radarr');
    await expect(page.getByTestId('admin-problem-reports-automatic-on')).toHaveAttribute('data-disabled');

    radarr.recycleBin = true;
    await page.reload();
    await page.getByTestId('settings-problem-reports-edit').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-problem-reports-recycle-bin')).toHaveCount(0);
    await page.getByTestId('admin-problem-reports-automatic-on').click();
    await page.getByTestId('settings-problem-reports-save').click();

    await expect(page.getByTestId('settings-problem-reports-summary-automatic')).toHaveText(/On$/);
    expect(await withDb((prisma) => prisma.problemReportSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID }, select: { automatic: true } }))).toEqual({ automatic: 'ON' });
  });

  test('a member swaps a copy that looks filmed off a screen, then says the new copy is still broken', async ({ regularUserPage: page }) => {
    await setMode('ON');
    plex.sessions = [WATCHING];

    const sheet = await chooseFilmedOffScreen(page);
    await expect(sheet.getByTestId('report-consequence-note')).toHaveText('3 of 3 swaps left.');
    await expect(sheet.getByTestId('report-send')).toContainText('Swap the copy');
    await sheet.getByTestId('report-send').click();
    await expect(sheet.getByTestId('report-sent-line')).toContainText("We'll find a different copy and swap it in.");
    const report = await reportOf();

    // The swap waits while the title plays, then grabs another release
    await onceDelayed(report.id, async (promote) => {
      expect(radarr.grabs).toEqual([]);
      plex.sessions = [];
      await promote();
    });
    await expect.poll(() => radarr.grabs, { timeout: 30_000 }).toEqual([{ guid: 'guid-good', indexerId: 1 }]);
    await runNextStep(report.id);
    await expect.poll(() => statusOf(report.id), { timeout: 30_000 }).toBe('FIXED');
    const ledger = await withDb((prisma) => prisma.problemFixLedger.findFirstOrThrow({ where: { reportId: report.id, action: 'SWAP' }, select: { trigger: true, outcome: true, replacedAt: true } }));
    expect(ledger).toMatchObject({ trigger: 'automatic', outcome: 'FIXED', replacedAt: expect.any(Date) });

    await page.goto('/report');
    await expect(page.getByTestId(`report-plays-${report.id}`)).toContainText('Does it play now?', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await page.getByTestId(`report-plays-no-${report.id}`).click();
    await page.getByTestId('report-plays-note').fill('Still looks filmed off a screen');
    await page.getByTestId('report-plays-send').click();

    await expect(page.getByTestId(`report-row-status-${report.id}`)).toContainText('With the server admin');
    await expect(page.getByTestId(`report-plays-${report.id}`)).toHaveCount(0);
    const reopened = await withDb((prisma) => prisma.problemReportEvent.findFirstOrThrow({ where: { reportId: report.id, kind: 'REOPENED' }, select: { data: true } }));
    expect(reopened.data).toEqual({ reason: 'still_broken', note: 'Still looks filmed off a screen' });
    expect(radarr.grabs).toHaveLength(1);
  });

  test("in Dry run a member's swap stops at its pick, and the server admin sees the copy it would grab", async ({ regularUserPage: page, adminPage }) => {
    await setMode('DRY_RUN');
    plex.sessions = [WATCHING];

    const sheet = await chooseFilmedOffScreen(page);
    await expect(sheet.getByTestId('report-send')).toContainText('Send to the server admin');
    await expect(sheet.getByTestId('report-consequence-note')).toHaveCount(0);
    await sheet.getByTestId('report-send').click();
    await expect(sheet.getByTestId('report-sent-line')).toContainText('The server admin will take a look.');
    const report = await reportOf();

    // While the dry run waits for the title to stop playing, the member sees the report with the server admin
    await onceDelayed(report.id, async (promote) => {
      expect(await statusOf(report.id)).toBe('FIXING');
      await page.goto('/report');
      await expect(page.getByTestId(`report-row-status-${report.id}`)).toContainText('With the server admin', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      plex.sessions = [];
      await promote();
    });
    await expect.poll(() => statusOf(report.id), { timeout: 30_000 }).toBe('WITH_ADMIN');
    expect(radarr.grabs).toEqual([]);

    await adminPage.goto(`/admin/problem-reports/${report.id}`);
    const timeline = adminPage.getByTestId('admin-problem-report-timeline');
    await expect(timeline).toContainText('Started a dry run of swapping the copy for the member', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(timeline).toContainText(`Dry run: a swap would bring in ${GOOD}. Swap the copy to run it`);
  });

  test('a member out of swaps is told when one comes back, and the server admin is told why it came to them', async ({ regularUserPage: page }) => {
    await setMode('ON');
    plex.sessions = [WATCHING];
    await withDb(async (prisma) => {
      const member = await prisma.user.findFirstOrThrow({ where: { isAdmin: false, plexUserId: 'regular-plex-id' }, select: { id: true } });
      await prisma.problemFixLedger.createMany({
        data: [2, 3, 4].map((days) => {
          const at = new Date(Date.now() - days * DAY_MS);
          return { target: TARGET, action: 'SWAP', trigger: 'automatic', reporterId: member.id, titleKey: `plex://movie/e2e-swapped-${days}`, outcome: 'FIXED', startedAt: at, replacedAt: at, endedAt: at };
        }),
      });
    });

    const sheet = await chooseFilmedOffScreen(page);
    await expect(sheet.getByTestId('report-consequence-note')).toContainText("You're out of swaps until ");
    await expect(sheet.getByTestId('report-send')).toContainText('Send to the server admin');
    await sheet.getByTestId('report-send').click();
    await expect(sheet.getByTestId('report-sent-line')).toContainText('The server admin will take a look.');

    const report = await reportOf();
    expect(await statusOf(report.id)).toBe('WITH_ADMIN');
    const handed = await withDb((prisma) => prisma.problemReportEvent.findFirstOrThrow({ where: { reportId: report.id, kind: 'TO_ADMIN' }, select: { data: true } }));
    expect(handed.data).toEqual({ reason: 'OUT_OF_SWAPS' });
  });
});
