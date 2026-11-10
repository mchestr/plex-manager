import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearReportLimits } from './helpers/rate-limits';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
import { MOCK_MOVIE, startMockRadarr, type MockRadarr } from './mocks/radarr-server';

/**
 * Plex's match (docs/problem-reports.md, "Fix the Plex match"): the admin
 * fixes a movie Plex matched to another title, and the report ends fixed
 * once the movie has Radarr's ids; and a member's report of wrong details
 * checks the match against Radarr, then asks Plex to read the details again.
 * Radarr is the mock in `e2e/mocks/radarr-server.ts`; the stub Plex server
 * below answers the match calls and changes the movie's ids when it is
 * matched.
 */

const MOVIE = { ratingKey: '95101', title: 'Harbour Heist', folder: '/movies/Harbour Heist (2024)' };
const FILE_NAME = 'Harbour Heist (2024) Bluray-1080p.mkv';
const RIGHT_GUID = 'plex://movie/e2e-harbour-heist';
const WRONG = { guid: 'plex://movie/e2e-harbour-heights', title: 'Harbour Heights', tmdbId: 11111 };
const SETTINGS_ID = 'problem-reports';
const RADARR_ID = 'e2e-reports-radarr';

interface StubPlex {
  server: Server;
  /** Whether Plex has the movie matched to the right title now. */
  matched: boolean;
  /** Every match and refresh asked of Plex, as `METHOD path?query`. */
  calls: string[];
}

/** Answers identity, the movie as matched now, its section, the agent's matches, the match and a refresh; everything else is a 404. */
async function startStubPlex(): Promise<StubPlex> {
  const stub = { matched: true, calls: [] as string[] };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://stub');
    const json = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const item = `/library/metadata/${MOVIE.ratingKey}`;
    if (url.pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="e2e-match-machine" />');
    } else if (request.method === 'GET' && url.pathname === item) {
      const now = stub.matched ? { guid: RIGHT_GUID, title: MOVIE.title, tmdbId: MOCK_MOVIE.tmdbId } : WRONG;
      json({
        MediaContainer: {
          size: 1,
          librarySectionID: 1,
          Metadata: [
            {
              ratingKey: MOVIE.ratingKey,
              type: 'movie',
              title: now.title,
              year: 2024,
              guid: now.guid,
              librarySectionID: 1,
              Guid: [{ id: `tmdb://${now.tmdbId}` }],
              Media: [{ Part: [{ file: `/data${MOVIE.folder}/${FILE_NAME}`, size: 4200 }] }],
            },
          ],
        },
      });
    } else if (url.pathname === '/library/sections') {
      json({ MediaContainer: { Directory: [{ key: '1', type: 'movie', agent: 'tv.plex.agents.movie', language: 'en-US' }] } });
    } else if (url.pathname === `${item}/matches`) {
      stub.calls.push(`GET ${url.pathname}?title=${url.searchParams.get('title')}`);
      json({ MediaContainer: { size: 1, SearchResult: [{ guid: RIGHT_GUID, name: MOVIE.title, year: 2024, score: 100 }] } });
    } else if (url.pathname === '/library/sections/1/all') {
      json({ MediaContainer: { size: 0 } });
    } else if (request.method === 'PUT' && url.pathname === `${item}/match`) {
      stub.calls.push(`PUT ${url.pathname}?guid=${url.searchParams.get('guid')}`);
      stub.matched = url.searchParams.get('guid') === RIGHT_GUID;
      response.writeHead(200);
      response.end();
    } else if (request.method === 'PUT' && url.pathname === `${item}/refresh`) {
      stub.calls.push(`PUT ${url.pathname}`);
      response.writeHead(200);
      response.end();
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // The handler reads `stub` on every request, so a test changes what Plex answers by setting its fields
  return Object.assign(stub, { server });
}

async function withDb<T>(run: (prisma: ReturnType<typeof createE2EPrismaClient>) => Promise<T>): Promise<T> {
  const prisma = createE2EPrismaClient();
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const TITLE_KEYS = [RIGHT_GUID, WRONG.guid];
/** The reports and the ledger rows their fixes wrote, so the hour's Plex changes count from nothing in each test. */
const clearReports = () =>
  withDb((prisma) =>
    prisma.$transaction([
      prisma.problemFixLedger.deleteMany({ where: { target: { in: TITLE_KEYS.map((key) => `plex:${key}`) } } }),
      prisma.problemReport.deleteMany({ where: { titleKey: { in: TITLE_KEYS } } }),
    ])
  );
const statusOf = (id: string) => withDb((prisma) => prisma.problemReport.findUniqueOrThrow({ where: { id }, select: { status: true } }));

test.describe('Problem reports: the Plex match', () => {
  let plex: StubPlex;
  let radarr: MockRadarr;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    [plex, radarr] = await Promise.all([startStubPlex(), startMockRadarr(MOVIE.folder)]);
    await clearReports();
    await clearReportLimits();
    await withDb(async (prisma) => {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
      await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: `http://127.0.0.1:${(plex.server.address() as AddressInfo).port}` } });
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
    await Promise.all([new Promise((resolve) => plex.server.close(resolve)), radarr.close()]);
  });

  test.beforeEach(async () => {
    await clearReports();
    plex.calls.length = 0;
    radarr.file = { id: 70, relativePath: FILE_NAME, size: 4200, qualityCutoffNotMet: false, customFormatScore: 0 };
  });

  test('the admin fixes a movie Plex matched to another title, and the report ends fixed', async ({ adminPage: page }) => {
    plex.matched = false;
    const report = await withDb(async (prisma) => {
      const reporter = await prisma.user.findFirstOrThrow({ where: { isAdmin: false }, select: { id: true } });
      return prisma.problemReport.create({
        data: {
          reporterId: reporter.id,
          problem: 'different_title',
          mediaType: 'MOVIE',
          plexRatingKey: MOVIE.ratingKey,
          titleKey: WRONG.guid,
          activeKey: WRONG.guid,
          title: WRONG.title,
          year: 2024,
          status: 'WITH_ADMIN',
          events: { create: { kind: 'REPORTED', actorUserId: reporter.id, data: { problem: 'different_title' } } },
        },
        select: { id: true },
      });
    });

    await page.goto(`/admin/problem-reports/${report.id}`);
    await page.getByTestId('admin-problem-report-fix-fix-match').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect.poll(() => statusOf(report.id), { timeout: 45_000 }).toEqual({ status: 'FIXED' });
    expect(plex.calls).toEqual([`GET /library/metadata/${MOVIE.ratingKey}/matches?title=tmdb-${MOCK_MOVIE.tmdbId}`, `PUT /library/metadata/${MOVIE.ratingKey}/match?guid=${RIGHT_GUID}`]);
    await page.reload();
    await expect(page.getByTestId('admin-problem-report-timeline')).toContainText('Fixed: Plex has the title Radarr or Sonarr has');
  });

  test("a member's report of wrong details checks the match, then asks Plex to read the details again", async ({ regularUserPage: page }) => {
    plex.matched = true;

    await page.goto(`/report?item=${MOVIE.ratingKey}`);
    const sheet = page.getByTestId('report-sheet');
    await sheet.getByTestId('report-kind-wrong_title').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await sheet.getByTestId('report-problem-wrong_details').click();
    await expect(sheet.getByTestId('report-send')).toContainText('Fix the details');
    await sheet.getByTestId('report-send').click();
    await expect(sheet.getByTestId('report-sent-line')).toContainText("We'll check the details and ask Plex to read them again.");

    const report = await withDb((prisma) => prisma.problemReport.findFirstOrThrow({ where: { titleKey: RIGHT_GUID }, select: { id: true } }));
    await expect.poll(() => statusOf(report.id), { timeout: 30_000 }).toEqual({ status: 'FIXED' });
    expect(plex.calls).toEqual([`PUT /library/metadata/${MOVIE.ratingKey}/refresh`]);
    await sheet.getByTestId('report-done').click();
    await page.reload();
    await expect(page.getByTestId(`report-row-latest-${report.id}`)).toContainText('The details are refreshed');
  });
});
