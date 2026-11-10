import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';
import { MOCK_SERIES, startMockSonarr, type MockEpisode, type MockSonarr } from './mocks/sonarr-server';

/**
 * "Episodes are missing" (docs/problem-reports.md, "Fixes"): a member who
 * reports it gets an answer when the episode hasn't aired or the season
 * isn't monitored, and otherwise Look for the episodes starts and Sonarr is
 * asked to search; the admin can start it from a report too. Sonarr is the
 * mock in `e2e/mocks/sonarr-server.ts`, and the show comes from a stub Plex
 * server in library section 1, which the plex.tv mock shares with the
 * regular member.
 */

const SHOW = { ratingKey: '95001', title: 'Harbour Show', guid: 'plex://show/e2e-harbour-show', folder: '/tv/Harbour Show' };
const PILOT_FILE = `${SHOW.folder}/Season 01/Harbour Show S01E01.mkv`;
const SETTINGS_ID = 'problem-reports';
const SONARR_ID = 'e2e-reports-sonarr';
const AIRED = '2026-01-01T00:00:00Z';

const pilot: MockEpisode = { id: 1, seasonNumber: 1, episodeNumber: 1, airDateUtc: AIRED, monitored: true, hasFile: true, episodeFileId: 10 };
const PILOT_FILES = [{ id: 10, relativePath: 'Season 01/Harbour Show S01E01.mkv' }];

/** Answers identity, the show, its episodes and a folder scan; everything else is a 404. */
function startStubPlex(): Promise<Server> {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const json = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="e2e-missing-machine" />');
    } else if (pathname === `/library/metadata/${SHOW.ratingKey}`) {
      json({
        MediaContainer: {
          size: 1,
          librarySectionID: 1,
          Metadata: [
            { ratingKey: SHOW.ratingKey, type: 'show', title: SHOW.title, year: 2024, guid: SHOW.guid, librarySectionID: 1, Guid: [{ id: `tvdb://${MOCK_SERIES.tvdbId}` }], Location: [{ path: SHOW.folder }] },
          ],
        },
      });
    } else if (pathname === `/library/metadata/${SHOW.ratingKey}/allLeaves`) {
      json({ MediaContainer: { size: 1, Metadata: [{ ratingKey: '95011', type: 'episode', title: 'Pilot', parentIndex: 1, index: 1, Media: [{ Part: [{ file: PILOT_FILE }] }] }] } });
    } else if (pathname === '/library/sections/1/refresh') {
      response.writeHead(200);
      response.end();
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
      prisma.problemFixLedger.deleteMany({ where: { target: `sonarr:series:${MOCK_SERIES.id}` } }),
      prisma.problemReport.deleteMany({ where: { titleKey: SHOW.guid } }),
    ])
  );

test.describe('Problem reports: missing episodes', () => {
  let plex: Server;
  let sonarr: MockSonarr;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    [plex, sonarr] = await Promise.all([startStubPlex(), startMockSonarr()]);
    await clearReports();
    await withDb(async (prisma) => {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
      await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: `http://127.0.0.1:${(plex.address() as AddressInfo).port}` } });
      await prisma.problemReportSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, enabled: true }, update: { enabled: true } });
      const row = { name: 'E2E Sonarr', url: sonarr.url, apiKey: 'e2e-sonarr-key', isActive: true };
      await prisma.sonarr.upsert({ where: { id: SONARR_ID }, create: { id: SONARR_ID, ...row }, update: row });
    });
  });

  test.afterAll(async () => {
    await clearReports();
    await withDb(async (prisma) => {
      if (originalUrl) await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url: originalUrl } });
      await prisma.problemReportSettings.deleteMany({ where: { id: SETTINGS_ID } });
      await prisma.sonarr.deleteMany({ where: { id: SONARR_ID } });
    });
    await Promise.all([new Promise((resolve) => plex.close(resolve)), sonarr.close()]);
  });

  test.beforeEach(() => {
    sonarr.commands.length = 0;
  });

  /** Reports "Episodes are missing" for the show and answers with the sent step's line. */
  async function reportMissing(page: Page) {
    await page.goto(`/report?item=${SHOW.ratingKey}`);
    const sheet = page.getByTestId('report-sheet');
    await sheet.getByTestId('report-kind-episodes').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await sheet.getByTestId('report-problem-missing_episodes').click();
    await expect(sheet.getByTestId('report-send')).toContainText('Look for them');
    await sheet.getByTestId('report-send').click();
    return sheet.getByTestId('report-sent-line');
  }

  test('a member is told when the missing episode comes out, and nothing is filed', async ({ regularUserPage: page }) => {
    sonarr.state = { episodes: [pilot, { id: 2, seasonNumber: 1, episodeNumber: 2, airDateUtc: '2099-11-14T02:00:00Z', monitored: true, hasFile: false }], files: PILOT_FILES };

    await expect(await reportMissing(page)).toContainText('Season 1, episode 2 comes out');
    expect(await withDb((prisma) => prisma.problemReport.count({ where: { titleKey: SHOW.guid } }))).toBe(0);
  });

  test("a member is told which season isn't on the server", async ({ regularUserPage: page }) => {
    sonarr.state = { episodes: [pilot, { id: 21, seasonNumber: 2, episodeNumber: 1, airDateUtc: AIRED, monitored: false, hasFile: false }], files: PILOT_FILES };

    await expect(await reportMissing(page)).toHaveText("Season 2 isn't on the server.");
    expect(sonarr.commands).toEqual([]);
  });

  test('Sonarr looks for monitored episodes that aired, and the report says so', async ({ regularUserPage: page }) => {
    sonarr.state = { episodes: [pilot, { id: 2, seasonNumber: 1, episodeNumber: 2, airDateUtc: AIRED, monitored: true, hasFile: false }], files: PILOT_FILES };

    await expect(await reportMissing(page)).toContainText("We'll look for the missing episodes now. Nothing is removed.");
    await expect.poll(() => sonarr.commands, { timeout: 30_000 }).toEqual([{ name: 'EpisodeSearch', episodeIds: [2] }]);

    await page.getByTestId('report-done').click();
    await expect(page.locator('[data-testid^="report-row-status-"]')).toContainText('Fixing');
    await clearReports();
  });

  test('the admin starts Look for the episodes from a report', async ({ adminPage: page }) => {
    sonarr.state = { episodes: [pilot, { id: 3, seasonNumber: 1, episodeNumber: 3, airDateUtc: AIRED, monitored: true, hasFile: false }], files: PILOT_FILES };
    const report = await withDb(async (prisma) => {
      const reporter = await prisma.user.findFirstOrThrow({ where: { isAdmin: false }, select: { id: true } });
      return prisma.problemReport.create({
        data: {
          reporterId: reporter.id,
          problem: 'missing_episodes',
          mediaType: 'TV_SERIES',
          plexRatingKey: SHOW.ratingKey,
          titleKey: SHOW.guid,
          activeKey: SHOW.guid,
          title: SHOW.title,
          year: 2024,
          status: 'WITH_ADMIN',
          events: { create: { kind: 'REPORTED', actorUserId: reporter.id, data: { problem: 'missing_episodes' } } },
        },
        select: { id: true },
      });
    });

    await page.goto(`/admin/problem-reports/${report.id}`);
    await page.getByTestId('admin-problem-report-fix-look-for-missing').click({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect.poll(() => sonarr.commands, { timeout: 30_000 }).toEqual([{ name: 'EpisodeSearch', episodeIds: [3] }]);
    await page.reload();
    await expect(page.getByTestId('admin-problem-report-running')).toHaveText('Looking for the episodes');
    await expect(page.getByTestId('admin-problem-report-timeline')).toContainText('Started looking for the episodes');
  });
});
