import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

import { mintSessionToken, sessionCookieName } from './fixtures/session';
import {
  buildCleanupWorld,
  CLEANUP_A11Y_RULE_IDS,
  CLEANUP_API_KEYS,
  CLEANUP_COLLECTION,
  CLEANUP_MEMBERS,
  CLEANUP_PLEX,
  movieKey,
  plexTvUsersXml,
  showKey,
  UNTRANSCODABLE,
  worldItem,
} from './helpers/cleanup-fixtures';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearRateLimits } from './helpers/rate-limits';
import {
  clearCleanup,
  restorePlex,
  seedCleanup,
  seedCleanupA11y,
  UNREACHABLE_PLEX_URL,
  useCleanupPlex,
  useUnreachablePlex,
  wipeCleanup,
} from './helpers/seed-cleanup';
import { clearMockRequests, mockRequests, mockUrl } from './mocks/request-log';

/**
 * The cleanup seed and mocks themselves (TS 16.4, delivery-r5-4), with no
 * browser: later specs build on them.
 *
 * - `seedCleanup()` and `seedCleanupA11y()` succeed twice in a row after the
 *   app made a Keep and an item with cuid ids, and each wipes them.
 * - After a seed, every mock holds the state of `buildCleanupWorld(now)` at
 *   the seed's clock, and the records of two mocks order by `seq`.
 * - The four-call Plex helper sequence leaves the Plex row as it was. While
 *   the row points at the mock, the poster route proves which sections
 *   plex.tv shares with each member, through `getSharedSectionKeys()`.
 * - A seed waits for a held claim, and fails with a clear message when it
 *   stays. Without `REDIS_URL` it opens no Redis connection. With a
 *   `REDIS_URL` where nothing answers, it stops within 5 s.
 *
 * It passes without `REDIS_URL`, as `$IMPL_ENV/pw` runs it (delivery-r6-2).
 * afterAll wipes the cleanup rows and puts the Plex row back.
 */

const PREFIX = 'e2e-cleanup-seed';
const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3100'}`;

const arr = (mock: 'radarr' | 'sonarr', path: string, init: RequestInit = {}) =>
  fetch(`${mockUrl(mock)}${path}`, { ...init, headers: { 'X-Api-Key': CLEANUP_API_KEYS[mock], ...init.headers } });
const plex = (path: string, init: RequestInit = {}) =>
  fetch(`${mockUrl('plex')}${path}`, { ...init, headers: { 'X-Plex-Token': CLEANUP_PLEX.token, Accept: 'application/json', ...init.headers } });

/** An API client signed in as a seeded user, through the minted session cookie (`e2e/fixtures/session.ts`). */
async function signedIn(userId: string): Promise<APIRequestContext> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET must be set to mint an E2E session cookie.');
  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true, isAdmin: true, sessionVersion: true },
    });
    const token = await mintSessionToken(user, secret);
    return playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Cookie: `${sessionCookieName(BASE_URL)}=${token}` } });
  } finally {
    await prisma.$disconnect();
  }
}

/** The active Plex row, every column. */
async function activePlexRow() {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.plexServer.findFirstOrThrow({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Writes the active Plex row's URL. `restorePlex()` still puts back the row that `useCleanupPlex()` saved first. */
async function setActivePlexUrl(url: string): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    const row = await prisma.plexServer.findFirstOrThrow({ where: { isActive: true }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
    await prisma.plexServer.update({ where: { id: row.id }, data: { url } });
  } finally {
    await prisma.$disconnect();
  }
}

async function setCollectionsClaim(at: Date | null): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.cleanupSettings.upsert({ where: { id: 'cleanup' }, create: { id: 'cleanup', collectionsClaimAt: at }, update: { collectionsClaimAt: at } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Media cleanup seed and mocks', () => {
  // Four seeds in one case, and next dev compiles the poster route on its first call
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeAll(async () => {
    await seedCleanup(PREFIX);
  });

  test.afterAll(async () => {
    await restorePlex();
    await setCollectionsClaim(null);
    await wipeCleanup();
    await clearCleanup(PREFIX);
  });

  test('both seeds succeed twice in a row after the app made a Keep and an item with cuid ids', async () => {
    const prisma = createE2EPrismaClient();
    try {
      // Rows as the app makes them: cuid ids, which clearCleanup(prefix) never matches
      const appMade = async () => {
        const item = await prisma.cleanupItem.create({
          data: { itemKey: 'movie:tmdb:1', level: 'movie', titleKey: 'tmdb:1', sectionId: '1', ratingKey: '1', title: 'Made by the app', sizeBytes: BigInt(1),
            arr: { service: 'radarr', id: 1, titleSlug: 'made-by-the-app', path: '/data/movies/Made by the app' }, state: 'leaving', action: 'movie.delete',
            why: {}, checkedAt: new Date() },
        });
        const keep = await prisma.cleanupProtection.create({
          data: { kind: 'memberKeep', itemKey: 'movie:tmdb:1', level: 'movie', titleKey: 'tmdb:1', title: 'Made by the app', memberId: CLEANUP_MEMBERS.member.id,
            createdBy: CLEANUP_MEMBERS.member.id, expiresAt: new Date(Date.now() + 86_400_000), activeKey: `keep:movie:tmdb:1:${CLEANUP_MEMBERS.member.id}` },
        });
        expect(item.id).not.toMatch(/^e2e-|^a11y-/);
        return [item.id, keep.id];
      };
      const gone = async ([itemId, keepId]: string[]) => {
        expect(await prisma.cleanupItem.count({ where: { id: itemId } })).toBe(0);
        expect(await prisma.cleanupProtection.count({ where: { id: keepId } })).toBe(0);
      };

      for (let round = 0; round < 2; round++) {
        const made = await appMade();
        const { rows } = await seedCleanup(PREFIX);
        await gone(made);
        expect(await prisma.cleanupItem.count()).toBe(rows.items.length);
        expect(await prisma.cleanupRule.count()).toBe(rows.rules.length);
        expect(await prisma.cleanupSnapshotPart.count({ where: { snapshotId: rows.snapshot.id } })).toBe(3);
      }
      for (let round = 0; round < 2; round++) {
        const made = await appMade();
        await seedCleanupA11y();
        await gone(made);
        expect((await prisma.cleanupRule.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((rule) => rule.id))
          .toEqual([CLEANUP_A11Y_RULE_IDS.dry, CLEANUP_A11Y_RULE_IDS.live]);
        expect(await prisma.user.count({ where: { id: { in: Object.values(CLEANUP_MEMBERS).map((member) => member.id) } } })).toBe(3);
        const settings = await prisma.cleanupSettings.findUniqueOrThrow({ where: { id: 'cleanup' } });
        expect(settings).toEqual(expect.objectContaining({ enabled: true, runClaimAt: null, readClaimAt: null, collectionsClaimAt: null }));
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('a seed gives every mock the state of buildCleanupWorld at its own clock', async () => {
    // Change each stateful mock first, so the reset has something to undo
    const before = buildCleanupWorld(Date.now());
    const pipeline = worldItem(before, movieKey(before, 'pipeline'));
    expect((await arr('radarr', `/api/v3/movie/${pipeline.arr?.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await arr('radarr', `/api/v3/movie/${pipeline.arr?.id}`)).status).toBe(404);
    const series = worldItem(before, showKey(before, 'ended-a')).arr?.id;
    expect((await arr('sonarr', `/api/v3/series/${series}`, { method: 'DELETE' })).status).toBe(200);
    expect((await plex(`/library/collections/${CLEANUP_COLLECTION.ratingKey}/items/${pipeline.ratingKey}`, { method: 'DELETE' })).status).toBe(200);

    const { now } = await seedCleanup(PREFIX);
    const world = buildCleanupWorld(now);
    const body = async (response: Response) => {
      expect(response.status).toBe(200);
      return response.json() as Promise<Record<string, unknown>>;
    };
    expect(await body(await arr('radarr', '/api/v3/movie'))).toEqual(world.answers.radarr.movies);
    expect(await body(await arr('sonarr', '/api/v3/series'))).toEqual(world.answers.sonarr.series);
    const movies = (await body(await plex('/library/sections/1/all?type=1'))).MediaContainer as { totalSize: number; Metadata: unknown[] };
    expect(movies.totalSize).toBe(world.movies.length);
    expect(movies.Metadata).toEqual(world.answers.plex.rows['1'][1]);
    const members = (await body(await plex(`/library/collections/${CLEANUP_COLLECTION.ratingKey}/items`))).MediaContainer as { Metadata: { ratingKey: string }[] };
    expect(members.Metadata.map((item) => item.ratingKey)).toEqual([pipeline.ratingKey]);
    const requests = await body(await fetch(`${mockUrl('overseerr')}/api/v1/request?take=100&skip=0&sort=added&sortDirection=asc&filter=all`,
      { headers: { 'X-Api-Key': CLEANUP_API_KEYS.overseerr } }));
    expect(requests.results).toEqual(world.answers.overseerr.requests);
    const history = await body(await fetch(`${mockUrl('tautulli')}/api/v2?apikey=key&cmd=get_history&grouping=1&order_column=started&order_dir=asc&start=0&length=1000`));
    expect((history.response as { data: { data: unknown[] } }).data.data).toEqual(world.answers.tautulli.history);
    const users = await fetch(`${mockUrl('plexTv')}/api/users`, { headers: { 'X-Plex-Token': CLEANUP_PLEX.token } });
    expect(await users.text()).toBe(plexTvUsersXml(world));
  });

  test('the mocks answer as the services do, and number every call across mocks', async () => {
    for (const mock of ['radarr', 'plex', 'overseerr'] as const) await clearMockRequests(mock);
    expect((await arr('radarr', '/api/v3/tag')).status).toBe(200);
    expect((await plex('/identity')).status).toBe(200);
    expect((await arr('radarr', '/api/v3/rootfolder')).status).toBe(200);
    const radarrLog = await mockRequests('radarr');
    const plexLog = await mockRequests('plex');
    expect(radarrLog.map((entry) => entry.path)).toEqual(['/api/v3/tag', '/api/v3/rootfolder']);
    expect(radarrLog[0].seq).toBeLessThan(plexLog[0].seq);
    expect(plexLog[0].seq).toBeLessThan(radarrLog[1].seq);

    // Radarr: 404 for an unknown id, 415 for a body without JSON, 401 for another key
    expect((await arr('radarr', '/api/v3/movie/999999')).status).toBe(404);
    expect((await arr('radarr', '/api/v3/movie/999999?deleteFiles=true&addImportExclusion=true', { method: 'DELETE' })).status).toBe(404);
    expect((await arr('radarr', '/api/v3/movie/editor', { method: 'PUT', body: JSON.stringify({ movieIds: [1], monitored: false }) })).status).toBe(415);
    expect((await arr('radarr', '/api/v3/movie/editor', { method: 'PUT', body: JSON.stringify({ movieIds: [1], monitored: false }),
      headers: { 'Content-Type': 'application/json' } })).status).toBe(202);
    expect((await fetch(`${mockUrl('radarr')}/api/v3/movie`, { headers: { 'X-Api-Key': 'another-key' } })).status).toBe(401);
    // Sonarr: 500 for an unknown id on DELETE and PUT, and the episode routes
    expect((await arr('sonarr', '/api/v3/series/999999?deleteFiles=true', { method: 'DELETE' })).status).toBe(500);
    expect((await arr('sonarr', '/api/v3/series/999999', { method: 'PUT', body: JSON.stringify({ id: 999999, monitored: false, seasons: [] }),
      headers: { 'Content-Type': 'application/json' } })).status).toBe(500);
    expect((await arr('sonarr', '/api/v3/episode/monitor', { method: 'PUT', body: JSON.stringify({ episodeIds: [60001], monitored: false }) })).status).toBe(415);
    const episodes = (await (await arr('sonarr', '/api/v3/episode?seriesId=1&seasonNumber=1')).json()) as { seasonNumber: number }[];
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes.every((episode) => episode.seasonNumber === 1)).toBe(true);
    // Overseerr records every DELETE and answers 500
    expect((await fetch(`${mockUrl('overseerr')}/api/v1/request/101`, { method: 'DELETE', headers: { 'X-Api-Key': CLEANUP_API_KEYS.overseerr } })).status).toBe(500);
    expect((await mockRequests('overseerr')).filter((entry) => entry.method === 'DELETE').map((entry) => entry.path)).toEqual(['/api/v1/request/101']);
    // plex.tv refuses every token but the cleanup one, as it refuses test-token today
    expect((await fetch(`${mockUrl('plexTv')}/api/users`, { headers: { 'X-Plex-Token': 'test-token' } })).status).toBe(401);
    // No record holds a key
    for (const entry of [...(await mockRequests('radarr')), ...(await mockRequests('plex'))]) expect(JSON.stringify(entry)).not.toContain('e2e-cleanup-');
  });

  test('the four-call Plex helper sequence leaves the Plex row as it was, and plex.tv decides what each member sees', async () => {
    // The poster limits count per client address, and every earlier spec's posters came from this one: start them fresh
    if (process.env.REDIS_URL) await clearRateLimits(process.env.REDIS_URL, ['poster', 'poster:access']);
    const { world } = await seedCleanup(PREFIX);
    const before = await activePlexRow();
    const movie = worldItem(world, movieKey(world, 'batch-01')).ratingKey;
    const labelled = world.snapshot.parts.movie.find((item) => item.labels.includes(UNTRANSCODABLE.toLowerCase()))?.ratingKey;
    const show = worldItem(world, showKey(world, 'ended-a')).ratingKey;
    const clients = {
      member: await signedIn(CLEANUP_MEMBERS.member.id),
      filtered: await signedIn(CLEANUP_MEMBERS.filtered.id),
      noshare: await signedIn(CLEANUP_MEMBERS.noshare.id),
    };
    // The poster route lets a member fetch only a key in a section that plex.tv shares (getSharedSectionKeys, SEC-21)
    const poster = (who: keyof typeof clients, ratingKey: string | undefined) => clients[who].get(`/api/rewind/poster/${ratingKey}?w=96`).then((response) => response.status());
    try {
      await useCleanupPlex();
      const pointed = await activePlexRow();
      expect(pointed).toEqual(expect.objectContaining({ url: mockUrl('plex'), token: CLEANUP_PLEX.token, machineIdentifier: CLEANUP_PLEX.machineIdentifier }));
      expect(pointed.adminPlexUserId).toMatch(/^\d+$/);
      // The web server keeps a share list for 10 minutes per server URL (TS E29), and an earlier spec or repeat of the
      // run can have loaded it for the mock. "/<new segment>/.." names the same address under a new key, so plex.tv
      // answers this case
      await setActivePlexUrl(`${mockUrl('plex')}/seed-${Date.now()}/..`);
      expect(await poster('member', movie)).toBe(200);
      expect(await poster('member', show)).toBe(200);
      expect(await poster('noshare', movie)).toBe(404);
      // The filtered share drops the movie section from the keys, and keeps the show section
      expect(await poster('filtered', labelled)).toBe(404);
      expect(await poster('filtered', show)).toBe(200);
      const plexTvCalls = (await mockRequests('plexTv')).map((entry) => entry.path);
      expect(plexTvCalls).toContain(`/api/servers/${CLEANUP_PLEX.machineIdentifier}/shared_servers`);

      await useUnreachablePlex();
      expect((await activePlexRow()).url).toBe(UNREACHABLE_PLEX_URL);
      expect(await poster('member', movie)).toBe(404);

      await useCleanupPlex();
      expect(await poster('member', movie)).toBe(200);

      await restorePlex();
      expect(await activePlexRow()).toEqual(before);
      // Safe to call twice
      await restorePlex();
      expect(await activePlexRow()).toEqual(before);
    } finally {
      await restorePlex();
      await Promise.all(Object.values(clients).map((client) => client.dispose()));
    }
  });

  test('a seed waits while a claim is held, and fails with a clear message when it stays', async () => {
    await setCollectionsClaim(new Date());
    const started = Date.now();
    const release = new Promise<void>((resolve) => setTimeout(() => void setCollectionsClaim(null).then(resolve), 2000));
    const { rows } = await seedCleanup(PREFIX);
    await release;
    expect(Date.now() - started).toBeGreaterThanOrEqual(2000);
    expect(rows.items.length).toBeGreaterThan(0);

    await setCollectionsClaim(new Date());
    try {
      await expect(seedCleanup(PREFIX, { claimWaitMs: 1500 })).rejects.toThrow('A cleanup job still runs: cleanup:collections');
    } finally {
      await setCollectionsClaim(null);
    }
  });

  test('with a REDIS_URL where nothing answers, the seed stops within 5 s', async () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://127.0.0.1:9';
    const started = Date.now();
    try {
      await expect(seedCleanup(PREFIX)).rejects.toThrow('Redis does not answer at REDIS_URL');
      expect(Date.now() - started).toBeLessThan(5000);
    } finally {
      if (saved === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = saved;
    }
  });
});
