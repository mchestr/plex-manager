import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * Home's "New on" row (P10.12) against a stub Plex server: the row and its
 * Plex web links render for a Plex member (the seeded admin owns the server,
 * so every section is theirs), and a Jellyfin member gets no row.
 */

const MACHINE_ID = 'e2e-new-on-machine';
const NOW_S = Math.floor(Date.now() / 1000);

const SECTIONS = {
  MediaContainer: {
    size: 2,
    Directory: [
      { key: '1', type: 'movie', title: 'Movies' },
      { key: '2', type: 'show', title: 'TV Shows' },
    ],
  },
};
const MOVIES = {
  MediaContainer: {
    size: 2,
    totalSize: 2,
    librarySectionID: 1,
    Metadata: [
      { ratingKey: '90101', type: 'movie', title: 'Glasshouse', year: 2026, addedAt: NOW_S - 60 },
      { ratingKey: '90102', type: 'movie', title: 'Low Season', year: 2025, addedAt: NOW_S - 3600 },
    ],
  },
};
const SHOWS = {
  MediaContainer: {
    size: 1,
    totalSize: 1,
    librarySectionID: 2,
    Metadata: [{ ratingKey: '90201', type: 'show', title: 'Northbound', year: 2026, childCount: 1, addedAt: NOW_S - 600 }],
  },
};

/** Answers the few Plex endpoints the row reads; everything else (poster art) is a 404. */
function startStubPlex(): Promise<Server> {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const json = (body: unknown) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end(`<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="${MACHINE_ID}" />`);
    } else if (pathname === '/library/sections') json(SECTIONS);
    else if (pathname === '/library/sections/1/all') json(MOVIES);
    else if (pathname === '/library/sections/2/all') json(SHOWS);
    else {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function setPlexUrl(url: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Home: New on row', () => {
  let stub: Server;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    stub = await startStubPlex();
    const prisma = createE2EPrismaClient();
    try {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
    } finally {
      await prisma.$disconnect();
    }
    await setPlexUrl(`http://127.0.0.1:${(stub.address() as AddressInfo).port}`);
  });

  test.afterAll(async () => {
    if (originalUrl) await setPlexUrl(originalUrl);
    await new Promise((resolve) => stub.close(resolve));
  });

  test('a Plex member sees the newest titles, linked to Plex web', async ({ adminPage: page }) => {
    await page.goto('/');
    const row = page.getByTestId('home-new-on-row');
    await expect(row).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect(row.getByRole('heading', { level: 2 })).toHaveText(/^New on /);
    const items = row.locator('[data-testid^="home-new-on-item-"]');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toHaveAttribute('data-testid', 'home-new-on-item-90101');

    const link = page.getByTestId('home-new-on-item-90201');
    await expect(link).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\/desktop\/#!\/server\/[A-Za-z0-9-]+\/details\?key=%2Flibrary%2Fmetadata%2F90201$/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toContainText('Series, season 1');
    await expect(page.getByTestId('home-new-on-browse')).toHaveAttribute('rel', 'noopener noreferrer');

    // the row scrolls inside itself: the page never scrolls sideways
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('on a phone the row scrolls inside itself, never the page', async ({ adminPage: page }) => {
    // At 320 px the third poster starts past the edge, where its link's
    // sr-only text once widened the page by the row's whole length
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    const list = page.getByTestId('home-new-on-list');
    await expect(list).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    expect(await list.evaluate((row) => row.scrollWidth > row.clientWidth)).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a Jellyfin member sees no row', async ({ regularUserPage: page }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.update({
        where: { id: TEST_USERS.REGULAR.id },
        data: { primaryAuthService: 'jellyfin', onboardingStatus: { plex: true, jellyfin: true } },
      });
      await page.goto('/');
      await expect(page.getByTestId('home-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('home-new-on-row')).toHaveCount(0);
      await expect(page.getByTestId('home-new-on-skeleton')).toHaveCount(0);
    } finally {
      await prisma.user.update({
        where: { id: TEST_USERS.REGULAR.id },
        data: { primaryAuthService: TEST_USERS.REGULAR.primaryAuthService, onboardingStatus: TEST_USERS.REGULAR.onboardingStatus },
      });
      await prisma.$disconnect();
    }
  });
});
