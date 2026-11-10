import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Queue } from 'bullmq';

import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
import { MOCK_MOVIE, startMockRadarr, type MockRadarr } from './mocks/radarr-server';

/**
 * The fixes that replace a file (docs/problem-reports.md, "Swap the copy"
 * and "Remove the file and search"): the admin swaps a copy that won't
 * start for another release from Radarr's interactive search, and the report
 * ends Fixed with the old release on the blocklist; and the admin removes
 * the file behind a confirm that says what will happen, after which Radarr
 * monitors the movie again and searches. Radarr is the mock in
 * `e2e/mocks/radarr-server.ts`, and the movie comes from a stub Plex server
 * in library section 1. A fix's next step waits in the job queue, so the
 * spec promotes the delayed job rather than waiting for it.
 */

const MOVIE = { ratingKey: '95101', title: 'Harbour Heist', guid: 'plex://movie/e2e-harbour-heist', folder: '/movies/Harbour Heist (2024)' };
const FILE_NAME = 'Harbour Heist (2024) Bluray-1080p.mkv';
const SETTINGS_ID = 'problem-reports';
const RADARR_ID = 'e2e-reports-radarr';
const QUEUE_NAME = 'plex-wrapped';
const BAD = 'Harbour.Heist.2024.1080p.BluRay.x264-BAD';
const GOOD = 'Harbour.Heist.2024.1080p.BluRay.x264-GOOD';
const QUALITY = { quality: { id: 7, name: 'Bluray-1080p' }, revision: { version: 1, real: 0 } };
const EXISTING = ['Existing file on disk is of equal or higher preference: Bluray-1080p'];

/** Answers identity, the movie with its one file, no sessions and a trash Plex empties after each scan; everything else is a 404. */
function startStubPlex(): Promise<Server> {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const json = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="e2e-swap-machine" />');
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
      json({ MediaContainer: { size: 0 } });
    } else if (pathname === '/:/prefs') {
      json({ MediaContainer: { Setting: [{ id: 'autoEmptyTrash', value: true }] } });
    } else {
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

const clearReports = () => withDb((prisma) => prisma.problemReport.deleteMany({ where: { titleKey: MOVIE.guid } }));

/** A report that a copy won't start, with the server admin. */
const reportWontStart = () =>
  withDb(async (prisma) => {
    const reporter = await prisma.user.findFirstOrThrow({ where: { isAdmin: false }, select: { id: true } });
    return prisma.problemReport.create({
      data: {
        reporterId: reporter.id,
        problem: 'wont_start',
        mediaType: 'MOVIE',
        plexRatingKey: MOVIE.ratingKey,
        titleKey: MOVIE.guid,
        activeKey: MOVIE.guid,
        title: MOVIE.title,
        year: 2024,
        status: 'WITH_ADMIN',
        events: { create: { kind: 'REPORTED', actorUserId: reporter.id, data: { problem: 'wont_start' } } },
      },
      select: { id: true },
    });
  });

/** Runs the report's delayed fix job now, as if its wait were over. */
async function runNextStep(reportId: string) {
  const queue = new Queue(QUEUE_NAME, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
  try {
    const jobId = `problem-report-fix-${reportId}-1`;
    await expect.poll(async () => (await queue.getJob(jobId))?.getState(), { timeout: 30_000 }).toBe('delayed');
    await (await queue.getJob(jobId))?.promote();
  } finally {
    await queue.close();
  }
}

test.describe('Problem reports: swap the copy and remove the file', () => {
  let plex: Server;
  let radarr: MockRadarr;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    [plex, radarr] = await Promise.all([startStubPlex(), startMockRadarr(MOVIE.folder)]);
    await clearReports();
    await withDb(async (prisma) => {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
      await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: `http://127.0.0.1:${(plex.address() as AddressInfo).port}` } });
      await prisma.problemReportSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, enabled: true },
        update: { enabled: true, breakerTrippedAt: null },
      });
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
    await Promise.all([new Promise((resolve) => plex.close(resolve)), radarr.close()]);
  });

  test.beforeEach(async () => {
    await clearReports();
    radarr.file = { id: 70, relativePath: FILE_NAME, size: 4200, qualityCutoffNotMet: false, customFormatScore: 0, sceneName: BAD, quality: QUALITY, languages: [{ id: 1, name: 'English' }] };
    radarr.history = [
      { id: 41, eventType: 'grabbed', date: '2026-10-01T00:00:00Z', sourceTitle: BAD, downloadId: 'DL1', data: {} },
      { id: 42, eventType: 'downloadFolderImported', date: '2026-10-01T01:00:00Z', sourceTitle: BAD, downloadId: 'DL1', data: { fileId: '70' } },
    ];
    const release = (title: string, guid: string, seeders: number) => ({ guid, indexerId: 1, title, quality: QUALITY, customFormatScore: 0, rejected: true, rejections: EXISTING, languages: [{ id: 1, name: 'English' }], seeders });
    radarr.releases = [release(BAD, 'guid-bad', 50), release(GOOD, 'guid-good', 20)];
    radarr.recycleBin = false;
    for (const recorded of [radarr.commands, radarr.grabs, radarr.failed, radarr.blocklist, radarr.deleted, radarr.edits]) recorded.length = 0;
  });

  test('the admin swaps a copy that won\'t start, and the report ends fixed with the old release blocklisted', async ({ adminPage: page }) => {
    const report = await reportWontStart();

    await page.goto(`/admin/problem-reports/${report.id}`);
    await page.getByTestId('admin-problem-report-fix-swap').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect.poll(() => radarr.grabs, { timeout: 30_000 }).toEqual([{ guid: 'guid-good', indexerId: 1 }]);
    await runNextStep(report.id);
    await expect
      .poll(() => withDb((prisma) => prisma.problemReport.findUniqueOrThrow({ where: { id: report.id }, select: { status: true } })), { timeout: 30_000 })
      .toEqual({ status: 'FIXED' });
    expect(radarr.failed).toEqual([41]);

    await page.reload();
    await expect(page.getByTestId('admin-problem-report-timeline')).toContainText('Started swapping the copy');
    await expect(page.getByTestId('admin-problem-report-timeline')).toContainText(`Fixed: a different copy is on the server (${GOOD}). The old release is on the blocklist`);
  });

  test('the admin removes the file behind a confirm that says what happens, and Radarr monitors the movie and searches', async ({ adminPage: page }) => {
    const report = await reportWontStart();

    await page.goto(`/admin/problem-reports/${report.id}`);
    const otherFixes = page.getByTestId('admin-problem-report-other-fixes');
    const dialog = page.getByTestId('admin-problem-report-remove-dialog');
    await otherFixes.click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await page.getByTestId('admin-problem-report-fix-remove-and-search').click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(otherFixes).toBeFocused();
    expect(radarr.deleted).toEqual([]);

    await otherFixes.click();
    await page.getByTestId('admin-problem-report-fix-remove-and-search').click();
    await expect(dialog.getByTestId('admin-problem-report-removal-blocklist')).toContainText(`Radarr marks ${BAD} failed first`);
    await expect(dialog.getByTestId('admin-problem-report-removal-recycle-bin')).toContainText('the file is deleted for good');
    await expect(dialog.getByTestId('admin-problem-report-removal-trash')).toBeVisible();
    await dialog.getByTestId('admin-problem-report-remove-confirm').click();

    await expect.poll(() => radarr.deleted, { timeout: 30_000 }).toEqual([70]);
    expect(radarr.failed).toEqual([41]);
    await runNextStep(report.id);
    await expect.poll(() => radarr.commands, { timeout: 30_000 }).toEqual([{ name: 'MoviesSearch', movieIds: [MOCK_MOVIE.id] }]);
    expect(radarr.edits).toEqual([{ movieIds: [MOCK_MOVIE.id], monitored: true }]);

    await page.reload();
    await expect(page.getByTestId('admin-problem-report-running')).toHaveText('Looking for a new copy');
  });
});
