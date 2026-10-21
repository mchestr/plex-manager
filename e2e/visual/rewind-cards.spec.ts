import { createHash, randomBytes } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRewindSeed, REWIND_MEMBERS, REWIND_YEAR, seedRewind, type RewindFixtureId } from '../helpers/seed-rewind';
import { expect, skipUnlessProductionBuild, test } from './visual-test';

/**
 * The share cards (P7.6, design 12): every card of the heavy, median,
 * pocket (`light`) and extreme issues, rendered through the real owner
 * route and through a share link that publishes them all.
 *
 * - The owner and link PNGs of a card are byte-identical: both routes draw
 *   the same projection (design 6.1), and posters render as title cards
 *   here, since the E2E Plex server is unreachable.
 * - Each PNG matches its baseline within 0.5% of pixels (Playwright's
 *   pixelmatch comparison).
 *
 * A card is listed when the owner route draws it: a page the issue did not
 * print, or whose card is not eligible (Setup, Next year, a percentile
 * below the top 25%), answers 404. Cards are drawn on the server, so only
 * `rewind-visual-phone-chromium` runs this.
 */

const FIXTURES: RewindFixtureId[] = ['heavy', 'median', 'light', 'extreme'];

/** Every page a card can print, in issue order (`SHARE_PAGE_TYPES`). */
const SHARE_PAGES = [
  'cover', 'number', 'bookends', 'guess', 'top-shows', 'top-films', 'taste', 'people', 'clock',
  'calendar', 'race', 'records', 'requests', 'standing', 'centrefold', 'back-cover',
];

const OPTIONS = 'signed=0&art=0&daily=1';

/** The one project that runs the comparison. */
const CARD_PROJECT = 'rewind-visual-phone-chromium';

/** A live link on `userId`'s Rewind publishing `pages` with Daily detail; returns its asset key. */
async function createLink(userId: string, pages: string[]): Promise<string> {
  const assetKey = randomBytes(16).toString('base64url');
  const prisma = createE2EPrismaClient();
  try {
    const wrapped = await prisma.plexWrapped.findUniqueOrThrow({ where: { userId_year: { userId, year: REWIND_YEAR } }, select: { id: true } });
    await prisma.rewindShare.deleteMany({ where: { wrappedId: wrapped.id } });
    await prisma.rewindShare.create({
      data: {
        wrappedId: wrapped.id,
        tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        assetKey,
        pages,
        dailyDetail: true,
        cardFacts: [],
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  return assetKey;
}

async function png(request: APIRequestContext, url: string): Promise<Buffer | null> {
  const response = await request.get(url);
  if (response.status() === 404) return null;
  expect(response.status(), url).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  return response.body();
}

test.describe('Rewind share cards', () => {
  skipUnlessProductionBuild();
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === CARD_PROJECT) await seedRewind();
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name === CARD_PROJECT) await clearRewindSeed();
  });

  for (const fixture of FIXTURES) {
    test(`${fixture}: owner and link cards match each other and their baselines`, async ({ page, signIn }, testInfo) => {
      test.skip(testInfo.project.name !== CARD_PROJECT, 'Cards are drawn on the server; one browser is enough.');
      test.setTimeout(180_000);
      const member = REWIND_MEMBERS[fixture];
      await signIn(member.id);

      const prisma = createE2EPrismaClient();
      const wrapped = await prisma.plexWrapped
        .findUniqueOrThrow({ where: { userId_year: { userId: member.id, year: REWIND_YEAR } }, select: { id: true } })
        .finally(() => prisma.$disconnect());

      const owner = new Map<string, Buffer>();
      for (const type of SHARE_PAGES) {
        const body = await png(page.request, `/api/rewind/card/${wrapped.id}/${type}?${OPTIONS}`);
        if (body) owner.set(type, body);
      }
      expect(owner.size).toBeGreaterThan(5);

      const assetKey = await createLink(member.id, [...owner.keys()]);
      for (const [type, ownerPng] of owner) {
        const linkPng = await png(page.request, `/api/rewind/card/s/${assetKey}/${type}`);
        expect(linkPng, `${fixture} ${type} through the link`).not.toBeNull();
        expect(linkPng!.equals(ownerPng), `${fixture} ${type}: owner and link PNGs differ`).toBe(true);
        expect(ownerPng).toMatchSnapshot(`rewind-card-${fixture}-${type}.png`, { maxDiffPixelRatio: 0.005 });
      }
    });
  }
});
