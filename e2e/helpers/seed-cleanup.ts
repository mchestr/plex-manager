import { TEST_USERS } from '../fixtures/auth';
import type { PrismaClient } from '../../lib/generated/prisma/client';
import { normalizeTimeZone } from '../../lib/utils/zoned-time';
import { mockUrl, resetMock, RESET_MOCKS } from '../mocks/request-log';
import {
  buildCleanupWorld,
  CLEANUP_API_KEYS,
  CLEANUP_MEMBERS,
  CLEANUP_PLEX,
  CLEANUP_PREFIX,
  cleanupA11ySeedRows,
  cleanupPipelineSeedRows,
  cleanupSeedIds,
  cleanupSeedRows,
  type CleanupSeedRows,
  type CleanupWorld,
} from './cleanup-fixtures';
import { createE2EPrismaClient } from './prisma';
import { redisAnswers } from './rate-limits';

/**
 * The media cleanup seeds and the Plex helpers of the E2E specs (TS 16.4,
 * TS 16.5). The rows come from the pure builders of `./cleanup-fixtures.ts`.
 *
 * Every seed (`seedCleanup()`, `seedCleanupA11y()`, `seedCleanupPipeline()`):
 *
 * 1. Waits up to 30 s until no cleanup job runs: the three claim columns are
 *    null, and, only with `REDIS_URL` set, the queue `plex-wrapped` holds no
 *    active or waiting `cleanup:*` job. Then it removes the delayed
 *    `cleanup:*` jobs. A wipe under a running job would clear its claim and
 *    stop it (TS 8.1 item 2). After 30 s it fails with "A cleanup job still
 *    runs: {type}" (delivery-r5-2, delivery-r6-2). Without `REDIS_URL` it opens
 *    no Redis connection: the app then runs no job (TS 9.5 item 4).
 * 2. Deletes every row of the cleanup tables (items, protections, outcomes,
 *    runs, rules, snapshots and their parts) and clears the claims. Specs make
 *    rows through the app with cuid ids, which `clearCleanup(prefix)` leaves
 *    (delivery-r4-3).
 * 3. Sends `POST /__reset` with its own `now` to every mock, so the mocks and
 *    the seed use one clock (delivery-r6-5).
 * 4. Upserts the three cleanup members, and writes its rows: a complete
 *    snapshot with every source `ok`, so no page starts the first read.
 *
 * The specs run on one worker, so no other spec writes during a seed.
 */

/** How long a seed waits for a running cleanup job (delivery-r5-2). */
export const CLAIM_WAIT_MS = 30_000;
/** A closed local port: `/identity` fails at once, on a share-list cache key nothing warmed (delivery-r3-1). */
export const UNREACHABLE_PLEX_URL = 'http://127.0.0.1:9';

const QUEUE_NAME = 'plex-wrapped';
const POLL_MS = 200;
const CLAIMS = [
  ['runClaimAt', 'cleanup:run'],
  ['readClaimAt', 'cleanup:read'],
  ['collectionsClaimAt', 'cleanup:collections'],
] as const;

/** What a seed wrote: its clock, the world at that clock and the rows. */
export interface SeededCleanup {
  now: number;
  world: CleanupWorld;
  rows: CleanupSeedRows;
}

/** @internal A shorter wait, for the spec of the wait itself. */
export interface SeedOptions {
  claimWaitMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CleanupQueue = import('bullmq').Queue;

/** The queue, after a fast check that Redis answers. One attempt, no reconnects, so a dead Redis fails within a few seconds. */
async function openQueue(url: string): Promise<CleanupQueue> {
  if (!(await redisAnswers(url))) throw new Error('Redis does not answer at REDIS_URL');
  const { Queue } = await import('bullmq');
  const queue = new Queue(QUEUE_NAME, {
    connection: { url, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000, retryStrategy: () => null },
  });
  queue.on('error', () => undefined);
  return queue;
}

async function busyJob(queue: CleanupQueue): Promise<string | null> {
  const jobs = await queue.getJobs(['active', 'waiting', 'prioritized']);
  return jobs.find((job) => job?.name.startsWith('cleanup:'))?.name ?? null;
}

async function busyClaim(prisma: PrismaClient): Promise<string | null> {
  const row = await prisma.cleanupSettings.findUnique({
    where: { id: 'cleanup' },
    select: { runClaimAt: true, readClaimAt: true, collectionsClaimAt: true },
  });
  return CLAIMS.find(([column]) => row?.[column])?.[1] ?? null;
}

async function waitForIdle(prisma: PrismaClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const redisUrl = process.env.REDIS_URL;
  const queue = redisUrl ? await openQueue(redisUrl) : null;
  try {
    for (;;) {
      const busy = (queue ? await busyJob(queue) : null) ?? (await busyClaim(prisma));
      if (!busy) break;
      if (Date.now() >= deadline) throw new Error(`A cleanup job still runs: ${busy}`);
      await sleep(POLL_MS);
    }
    if (queue) {
      for (const job of await queue.getJobs(['delayed'])) if (job?.name.startsWith('cleanup:')) await job.remove();
    }
  } finally {
    await queue?.close();
  }
}

/** Waits until no cleanup job runs (seed step 1), up to `timeoutMs`. */
export async function waitForCleanupIdle(timeoutMs = CLAIM_WAIT_MS): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await waitForIdle(prisma, timeoutMs);
  } finally {
    await prisma.$disconnect();
  }
}

/** Every row of the cleanup tables, the claims and the dirty mark (seed step 2). */
async function wipe(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.cleanupItem.deleteMany(),
    prisma.cleanupProtection.deleteMany(),
    prisma.cleanupOutcome.deleteMany(),
    prisma.cleanupRun.deleteMany(),
    prisma.cleanupRule.deleteMany(),
    prisma.cleanupSnapshotPart.deleteMany(),
    prisma.cleanupSnapshot.deleteMany(),
    prisma.cleanupSettings.updateMany({ data: { runClaimAt: null, readClaimAt: null, collectionsClaimAt: null, collectionsDirtyAt: null } }),
  ]);
}

/** The server zone of the day keys, as the app reads it (`lib/utils/server-zone.ts`). */
async function serverZone(prisma: PrismaClient): Promise<string> {
  const config = await prisma.config.findUnique({ where: { id: 'config' }, select: { timezone: true } });
  return normalizeTimeZone(config?.timezone) ?? normalizeTimeZone(process.env.TZ) ?? 'UTC';
}

/** The three cleanup members, as copies of `TEST_USERS.REGULAR` with numeric Plex ids. Also after `seedVisualFixtures()` deleted them. */
async function upsertMembers(prisma: PrismaClient): Promise<void> {
  for (const member of Object.values(CLEANUP_MEMBERS)) {
    const data = {
      plexUserId: member.plexUserId,
      name: member.name,
      email: member.email,
      isAdmin: false,
      primaryAuthService: TEST_USERS.REGULAR.primaryAuthService,
      onboardingStatus: TEST_USERS.REGULAR.onboardingStatus,
    };
    await prisma.user.upsert({ where: { id: member.id }, create: { id: member.id, ...data }, update: data });
  }
}

async function upsertServices(prisma: PrismaClient, prefix: string): Promise<void> {
  const ids = cleanupSeedIds(prefix).services;
  const row = (name: string, url: string, apiKey: string) => ({ name, url, apiKey, isActive: true });
  // Upserts move updatedAt forward, so these become the active rows (`lib/data/active-service.ts`)
  const radarr = row('E2E Cleanup Radarr', mockUrl('radarr'), CLEANUP_API_KEYS.radarr);
  const sonarr = row('E2E Cleanup Sonarr', mockUrl('sonarr'), CLEANUP_API_KEYS.sonarr);
  const overseerr = row('E2E Cleanup Overseerr', mockUrl('overseerr'), CLEANUP_API_KEYS.overseerr);
  const tautulli = row('E2E Cleanup Tautulli', mockUrl('tautulli'), CLEANUP_API_KEYS.tautulli);
  await prisma.radarr.upsert({ where: { id: ids.radarr }, create: { id: ids.radarr, ...radarr }, update: radarr });
  await prisma.sonarr.upsert({ where: { id: ids.sonarr }, create: { id: ids.sonarr, ...sonarr }, update: sonarr });
  await prisma.overseerr.upsert({ where: { id: ids.overseerr }, create: { id: ids.overseerr, ...overseerr }, update: overseerr });
  await prisma.tautulli.upsert({ where: { id: ids.tautulli }, create: { id: ids.tautulli, ...tautulli }, update: tautulli });
}

async function write(prisma: PrismaClient, rows: CleanupSeedRows): Promise<void> {
  const { id, ...settings } = rows.settings;
  await prisma.$transaction([
    prisma.cleanupSettings.upsert({ where: { id }, create: rows.settings, update: settings }),
    prisma.cleanupRule.createMany({ data: rows.rules }),
    prisma.cleanupSnapshot.createMany({ data: [rows.snapshot] }),
    prisma.cleanupSnapshotPart.createMany({ data: rows.parts }),
    prisma.cleanupItem.createMany({ data: rows.items }),
    prisma.cleanupProtection.createMany({ data: rows.protections }),
    prisma.cleanupRun.createMany({ data: rows.runs }),
    prisma.cleanupOutcome.createMany({ data: rows.outcomes }),
  ]);
}

async function seed(build: (world: CleanupWorld) => CleanupSeedRows, options: SeedOptions & { services?: string }): Promise<SeededCleanup> {
  const prisma = createE2EPrismaClient();
  try {
    await waitForIdle(prisma, options.claimWaitMs ?? CLAIM_WAIT_MS);
    const now = Date.now();
    const world = buildCleanupWorld(now, await serverZone(prisma));
    const rows = build(world);
    await wipe(prisma);
    for (const mock of RESET_MOCKS) await resetMock(mock, now);
    await upsertMembers(prisma);
    if (options.services) await upsertServices(prisma, options.services);
    await write(prisma, rows);
    return { now, world, rows };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The full cleanup seed (TS 16.4): a rule in each mode, items in each state, a
 * deletion batch above 50 items and one below, an entry batch, Keeps,
 * exclusions, runs and outcomes, and the Radarr, Sonarr, Overseerr and
 * Tautulli rows on the mocks. The ids come from `cleanupSeedIds(prefix)`. The
 * Plex row stays: call `useCleanupPlex()` for pages that read Plex or plex.tv.
 */
export function seedCleanup(prefix: string = CLEANUP_PREFIX, options: SeedOptions = {}): Promise<SeededCleanup> {
  return seed((world) => cleanupSeedRows(prefix, world), { ...options, services: prefix });
}

/**
 * The seed of `e2e/admin/cleanup-pipeline.spec.ts` (TS 16.4 pipeline step 1):
 * one Review first rule, the pipeline movie due and waiting for approval, the
 * kept title, the snapshot, and the service rows on the mocks.
 */
export function seedCleanupPipeline(prefix: string = CLEANUP_PREFIX, options: SeedOptions = {}): Promise<SeededCleanup> {
  return seed((world) => cleanupPipelineSeedRows(prefix, world), { ...options, services: prefix });
}

/**
 * The axe seed (TS 16.5): the fixed rules `a11y-cleanup-rule-dry` and
 * `a11y-cleanup-rule-live` and their rows, and the three cleanup members.
 * Idempotent: it wipes the Keeps and items an earlier scan made, and writes
 * the fixed rows again. It writes no service row: the axe seed deleted them,
 * and the other axe routes must not show them.
 */
export async function seedCleanupA11y(options: SeedOptions = {}): Promise<void> {
  await seed((world) => cleanupA11ySeedRows(world), options);
}

/** The axe rows "first use" and "recipe sheet": no rule, and so no item. The snapshot stays, for the recipe counts. */
export async function clearCleanupA11yRules(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await waitForIdle(prisma, CLAIM_WAIT_MS);
    await prisma.$transaction([prisma.cleanupItem.deleteMany(), prisma.cleanupRule.deleteMany()]);
  } finally {
    await prisma.$disconnect();
  }
}

/** The axe reset of the member and turn-on rows: `seedCleanupA11y()`, then `useCleanupPlex()` (TS 16.5 item 3). */
export async function resetCleanupMemberA11y(): Promise<void> {
  await seedCleanupA11y();
  await useCleanupPlex();
}

/** Points the Radarr, Sonarr, Overseerr and Tautulli rows `{prefix}-radarr` and so on at the mocks (TS 16.4 rule 4). */
export async function useCleanupServices(prefix: string = CLEANUP_PREFIX): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await upsertServices(prisma, prefix);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Deletes what a seed with this prefix wrote: its cleanup rows, its service
 * rows, the three cleanup members and the settings row. Rows the app made
 * with cuid ids stay until the next seed.
 */
export async function clearCleanup(prefix: string = CLEANUP_PREFIX): Promise<void> {
  const prisma = createE2EPrismaClient();
  const id = { startsWith: `${prefix}-` };
  const services = cleanupSeedIds(prefix).services;
  try {
    await prisma.$transaction([
      prisma.cleanupItem.deleteMany({ where: { id } }),
      prisma.cleanupProtection.deleteMany({ where: { id } }),
      prisma.cleanupOutcome.deleteMany({ where: { id } }),
      prisma.cleanupRun.deleteMany({ where: { id } }),
      prisma.cleanupRule.deleteMany({ where: { id } }),
      prisma.cleanupSnapshot.deleteMany({ where: { id } }),
      prisma.radarr.deleteMany({ where: { id: services.radarr } }),
      prisma.sonarr.deleteMany({ where: { id: services.sonarr } }),
      prisma.overseerr.deleteMany({ where: { id: services.overseerr } }),
      prisma.tautulli.deleteMany({ where: { id: services.tautulli } }),
      prisma.user.deleteMany({ where: { id: { in: Object.values(CLEANUP_MEMBERS).map((member) => member.id) } } }),
      prisma.cleanupSettings.deleteMany(),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

/** Deletes every cleanup row, app-made ones too, and the settings row: for a spec's `afterAll`. */
export async function wipeCleanup(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await waitForIdle(prisma, CLAIM_WAIT_MS);
    await wipe(prisma);
    await prisma.cleanupSettings.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}

/* ----------------------------------------------------------- Plex helpers */

type PlexFields = { url: string; token: string; machineIdentifier: string | null; adminPlexUserId: string | null; updatedAt: Date };
/**
 * The active Plex row's four fields (and `updatedAt`) as the first
 * `useCleanupPlex()` or `useUnreachablePlex()` found them. Later calls keep
 * them until `restorePlex()` (delivery-r4-2). It lives in the worker, which
 * runs the specs one at a time.
 */
let saved: ({ id: string } & PlexFields) | null = null;

async function pointPlex(values: Partial<PlexFields>): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!saved) {
        const row = await prisma.plexServer.findFirst({
          where: { isActive: true },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, url: true, token: true, machineIdentifier: true, adminPlexUserId: true, updatedAt: true },
        });
        if (!row) throw new Error('No active Plex row: the global setup or seedVisualFixtures() makes one');
        saved = row;
      }
      const { count } = await prisma.plexServer.updateMany({ where: { id: saved.id }, data: values });
      if (count === 1) return;
      // The saved row is gone (a seed replaced the Plex rows): save the active row again
      saved = null;
    }
    throw new Error('The active Plex row changed during useCleanupPlex()');
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Points the active Plex row at the Plex mock (TS 16.4 rule 2): its URL, the
 * token `e2e-cleanup-plex-token`, the mock's machine identifier and the
 * owner's numeric plex.tv id. The first call saves the four fields. Safe to
 * call twice.
 */
export async function useCleanupPlex(): Promise<void> {
  await pointPlex({
    url: mockUrl('plex'),
    token: CLEANUP_PLEX.token,
    machineIdentifier: CLEANUP_PLEX.machineIdentifier,
    adminPlexUserId: CLEANUP_PLEX.ownerPlexId,
  });
}

/**
 * Points the active Plex row's URL at a closed local port (TS 16.4 rule 2.1):
 * `/identity` fails, and the share list of that new cache key is `null`, which
 * is never cached. The first call saves the four fields. Safe to call twice.
 */
export async function useUnreachablePlex(): Promise<void> {
  await pointPlex({ url: UNREACHABLE_PLEX_URL });
}

/**
 * Puts back the four fields (and `updatedAt`) that the first
 * `useCleanupPlex()` or `useUnreachablePlex()` saved, then forgets them.
 * Safe to call twice, and without a saved row.
 *
 * It cannot clear the web server's caches. A member page that loaded while
 * the mock was active keeps the mock's machine id in the `plex-identity`
 * cache (24 hours), so later "Watch on Plex" links can name it. No spec
 * asserts that id.
 */
export async function restorePlex(): Promise<void> {
  if (!saved) return;
  const { id, ...values } = saved;
  saved = null;
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexServer.updateMany({ where: { id }, data: values });
  } finally {
    await prisma.$disconnect();
  }
}
