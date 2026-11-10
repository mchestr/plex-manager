import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearReportLimits } from './helpers/rate-limits';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
import { MOCK_MOVIE, startMockRadarr, type MockRadarr } from './mocks/radarr-server';

/**
 * "Blurry or low quality" (docs/problem-reports.md, "Look for a better
 * copy"): a member whose copy is below the quality profile's cutoff starts
 * Look for a better copy, and Radarr is asked to search with the file in
 * place; one at the cutoff hears it is the best copy the server keeps and
 * can still send it to the server admin; the admin can start the fix from a
 * report. Radarr is the mock in `e2e/mocks/radarr-server.ts`, and the movie
 * comes from a stub Plex server in library section 1, which the plex.tv mock
 * shares with the regular member.
 */

const MOVIE = { ratingKey: '95101', title: 'Harbour Heist', guid: 'plex://movie/e2e-harbour-heist', folder: '/movies/Harbour Heist (2024)' };
const FILE_NAME = 'Harbour Heist (2024) WEBDL-720p.mkv';
const SETTINGS_ID = 'problem-reports';
const RADARR_ID = 'e2e-reports-radarr';

/** Answers identity and the movie with its one file; everything else is a 404. */
function startStubPlex(): Promise<Server> {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="e2e-better-copy-machine" />');
    } else if (pathname === `/library/metadata/${MOVIE.ratingKey}`) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
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
        })
      );
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

/** The reports and the ledger rows their fixes wrote, so the day's search cap counts from nothing in each test. */
const clearReports = () =>
  withDb((prisma) =>
    prisma.$transaction([
      prisma.problemFixLedger.deleteMany({ where: { target: `radarr:movie:${MOCK_MOVIE.id}` } }),
      prisma.problemReport.deleteMany({ where: { titleKey: MOVIE.guid } }),
    ])
  );
const fileAt = (qualityCutoffNotMet: boolean) => ({ id: 70, relativePath: FILE_NAME, size: 4200, qualityCutoffNotMet, customFormatScore: 0 });

test.describe('Problem reports: a better copy', () => {
  let plex: Server;
  let radarr: MockRadarr;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    [plex, radarr] = await Promise.all([startStubPlex(), startMockRadarr(MOVIE.folder)]);
    await clearReports();
    await clearReportLimits();
    await withDb(async (prisma) => {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
      await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: `http://127.0.0.1:${(plex.address() as AddressInfo).port}` } });
      await prisma.problemReportSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, enabled: true }, update: { enabled: true } });
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
    radarr.commands.length = 0;
    await clearReports();
  });

  /** Reports "Blurry or low quality" for the movie and answers with the sent step's line. */
  async function reportBlurry(page: Page) {
    await page.goto(`/report?item=${MOVIE.ratingKey}`);
    const sheet = page.getByTestId('report-sheet');
    await sheet.getByTestId('report-kind-picture').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await sheet.getByTestId('report-problem-blurry').click();
    await expect(sheet.getByTestId('report-send')).toContainText('Look for a better copy');
    await sheet.getByTestId('report-send').click();
    return sheet;
  }

  test('a copy below the cutoff starts Look for a better copy, and Radarr searches with the file in place', async ({ regularUserPage: page }) => {
    radarr.file = fileAt(true);

    const sheet = await reportBlurry(page);

    await expect(sheet.getByTestId('report-sent-line')).toContainText("We'll look for a better copy now.");
    await expect.poll(() => radarr.commands, { timeout: 30_000 }).toEqual([{ name: 'MoviesSearch', movieIds: [MOCK_MOVIE.id] }]);
    const report = await withDb((prisma) => prisma.problemReport.findFirstOrThrow({ where: { titleKey: MOVIE.guid }, select: { id: true } }));
    await sheet.getByTestId('report-done').click();
    await expect(page.getByTestId(`report-row-status-${report.id}`)).toContainText('Looking for a better copy');
  });

  test('a copy at the cutoff is the best copy the server keeps, and can still go to the server admin', async ({ regularUserPage: page }) => {
    radarr.file = fileAt(false);

    const sheet = await reportBlurry(page);

    await expect(sheet.getByTestId('report-sent-line')).toHaveText('This is the best copy the server keeps.');
    expect(await withDb((prisma) => prisma.problemReport.count({ where: { titleKey: MOVIE.guid } }))).toBe(0);
    await sheet.getByTestId('report-send-anyway').click();
    await expect(sheet.getByTestId('report-sent-line')).toContainText('The server admin will take a look.');
    expect(await withDb((prisma) => prisma.problemReport.findFirst({ where: { titleKey: MOVIE.guid }, select: { status: true } }))).toEqual({ status: 'WITH_ADMIN' });
    expect(radarr.commands).toEqual([]);
  });

  test('the admin starts Look for a better copy from a report', async ({ adminPage: page }) => {
    radarr.file = fileAt(true);
    const report = await withDb(async (prisma) => {
      const reporter = await prisma.user.findFirstOrThrow({ where: { isAdmin: false }, select: { id: true } });
      return prisma.problemReport.create({
        data: {
          reporterId: reporter.id,
          problem: 'blurry',
          mediaType: 'MOVIE',
          plexRatingKey: MOVIE.ratingKey,
          titleKey: MOVIE.guid,
          activeKey: MOVIE.guid,
          title: MOVIE.title,
          year: 2024,
          status: 'WITH_ADMIN',
          events: { create: { kind: 'REPORTED', actorUserId: reporter.id, data: { problem: 'blurry' } } },
        },
        select: { id: true },
      });
    });

    await page.goto(`/admin/problem-reports/${report.id}`);
    await page.getByTestId('admin-problem-report-fix-better-copy').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect.poll(() => radarr.commands, { timeout: 30_000 }).toEqual([{ name: 'MoviesSearch', movieIds: [MOCK_MOVIE.id] }]);
    await page.reload();
    await expect(page.getByTestId('admin-problem-report-running')).toHaveText('Looking for a better copy');
    await expect(page.getByTestId('admin-problem-report-timeline')).toContainText('Started looking for a better copy');
  });
});
