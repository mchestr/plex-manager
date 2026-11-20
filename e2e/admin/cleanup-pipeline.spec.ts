import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { CLEANUP_COLLECTION, cleanupPipelineSeedIds, type WorldMovie } from '../helpers/cleanup-fixtures';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearCleanup, restorePlex, seedCleanupPipeline, type SeededCleanup, useCleanupPlex, wipeCleanup } from '../helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';
import { clearMockRequests, mockRequests, RESET_MOCKS, type MockName, type MockRequest } from '../mocks/request-log';

/**
 * The whole media cleanup chain on the mocks (TS 16.4, the pipeline
 * scenario): a library read through every mock, then the approval of a
 * deletion batch of one movie, the act job, its pre-delete re-read and the
 * Radarr delete, and after it the Overseerr availability sync, the folder
 * scan and the guarded delete of the now empty Plex collection.
 *
 * The seed (`seedCleanupPipeline()`): the feature on with `enabledAt` and
 * `holdUntil` in the past, one Review first rule over the movie section, the
 * pipeline movie due and waiting for approval, a kept title with an active
 * Keep, and a complete snapshot that matches the mocks. The axe seed deletes
 * the Radarr, Sonarr, Overseerr and Tautulli rows, so the seed makes them
 * again with prefix ids, on the mocks.
 *
 * The read and the act step run in the worker of the web server, so the spec
 * needs the job queue. Without `REDIS_URL` the app runs no job and the
 * buttons are disabled (TS 9.5 item 4): every case skips. CI sets it.
 *
 * The calls of two mocks are ordered by the shared `seq` of the mock logs
 * (delivery-r3-4). A read in the Rewind season-open window makes no
 * snapshot, so the spec moves the season open about 6 months away while it
 * runs (delivery-r3-3).
 */

const IDS = cleanupPipelineSeedIds();
const REFRESHED = 'Library read started';
let seeded: SeededCleanup;
/** `Config.rewindSeasonOpens` before the spec: `undefined` when no Config row existed. */
let seasonOpens: string | undefined;

type RadarrMovie = WorldMovie & { arr: NonNullable<WorldMovie['arr']> };

/** A movie of the seeded world with its Radarr record, by its role. */
function movie(role: string): RadarrMovie {
  const found = seeded.world.movies.find((candidate) => candidate.role === role);
  if (!found?.arr) throw new Error(`The world has no Radarr movie ${role}`);
  return { ...found, arr: found.arr };
}

/** A month-day `MM-DD` about `days` from now, in UTC. */
function monthDayIn(days: number): string {
  const at = new Date(Date.now() + days * 86_400_000);
  return `${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
}

/** Sets `Config.rewindSeasonOpens` and returns the value before. */
async function setSeasonOpens(value: string): Promise<string | undefined> {
  const prisma = createE2EPrismaClient();
  try {
    const before = await prisma.config.findUnique({ where: { id: 'config' }, select: { rewindSeasonOpens: true } });
    await prisma.config.upsert({ where: { id: 'config' }, create: { id: 'config', rewindSeasonOpens: value }, update: { rewindSeasonOpens: value } });
    return before?.rewindSeasonOpens;
  } finally {
    await prisma.$disconnect();
  }
}

async function restoreSeasonOpens(value: string | undefined): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    if (value === undefined) await prisma.config.deleteMany({ where: { id: 'config' } });
    else await prisma.config.update({ where: { id: 'config' }, data: { rewindSeasonOpens: value } });
  } finally {
    await prisma.$disconnect();
  }
}

/** The newest snapshot that is not the seeded one, or null. */
async function newestSnapshot(): Promise<{ status: string; sources: unknown } | null> {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.cleanupSnapshot.findFirst({
      where: { NOT: { id: IDS.snapshot } },
      orderBy: { startedAt: 'desc' },
      select: { status: true, sources: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** The outcome rows of the pipeline movie. */
async function pipelineOutcomes(): Promise<{ kind: string; reason: string }[]> {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.cleanupOutcome.findMany({ where: { itemKey: movie('pipeline').key }, select: { kind: true, reason: true } });
  } finally {
    await prisma.$disconnect();
  }
}

async function clearLogs(): Promise<void> {
  for (const mock of RESET_MOCKS) await clearMockRequests(mock);
}

/** Every mock's records, merged and ordered by the shared `seq`. */
async function allRequests(): Promise<MockRequest[]> {
  const logs = await Promise.all(RESET_MOCKS.map((mock) => mockRequests(mock)));
  return logs.flat().sort((a, b) => a.seq - b.seq);
}

type Match = (request: MockRequest) => boolean;
const call = (mock: MockName, method: string, path: string | RegExp, query: Record<string, string> = {}): Match => (request) =>
  request.mock === mock &&
  request.method === method &&
  (typeof path === 'string' ? request.path === path : path.test(request.path)) &&
  Object.entries(query).every(([name, value]) => request.query[name] === value);
const describeCall = (request: MockRequest) => `${request.seq} ${request.mock} ${request.method} ${request.path}`;

/**
 * The `seq` of each match, each found after the one before it. A match that
 * is missing, or only before the one before it, fails with the log.
 */
function inOrder(requests: MockRequest[], steps: [string, Match][]): number[] {
  const seqs: number[] = [];
  let after = 0;
  for (const [name, match] of steps) {
    const found = requests.find((request) => request.seq > after && match(request));
    expect(found, `${name} after seq ${after}, in:\n${requests.map(describeCall).join('\n')}`).toBeDefined();
    after = found?.seq ?? after;
    seqs.push(after);
  }
  return seqs;
}

/** Presses a server-rendered button until `done` holds: a press before hydration does nothing (as the inactivity spec does). */
async function pressUntil(page: Page, testId: string, done: () => Promise<boolean>): Promise<void> {
  await expect(async () => {
    if (await done()) return;
    await page.getByTestId(testId).click({ timeout: 2000 });
    await expect.poll(done, { timeout: 3000 }).toBe(true);
  }).toPass({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
}

test.describe('Media cleanup pipeline', () => {
  test.skip(!process.env.REDIS_URL, 'Needs the job queue');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    seasonOpens = await setSeasonOpens(monthDayIn(182));
    // The seed makes the Radarr, Sonarr, Overseerr and Tautulli rows on the mocks, with prefix ids
    seeded = await seedCleanupPipeline();
    await useCleanupPlex();
    await clearLogs();
  });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
    await restorePlex();
    await restoreSeasonOpens(seasonOpens);
  });

  test('Refresh data now reads the library through every mock', async ({ adminPage: page }) => {
    test.setTimeout(150_000);
    await page.goto('/admin/cleanup?tab=settings');
    await expect(page.getByTestId('admin-cleanup-settings-refresh-data')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
    await clearLogs();

    const toast = page.getByTestId('toast').filter({ hasText: REFRESHED });
    await pressUntil(page, 'admin-cleanup-settings-refresh-data', async () => (await toast.count()) > 0 || (await newestSnapshot()) !== null);
    await expect.poll(async () => (await newestSnapshot())?.status ?? 'none', { timeout: 60_000, message: 'the new snapshot' }).toBe('complete');
    const snapshot = await newestSnapshot();
    expect((snapshot?.sources as { service: string; state: string }[]).filter((source) => source.state !== 'ok')).toEqual([]);

    const requests = await allRequests();
    const has = (name: string, match: Match) => expect(requests.some(match), `${name} in:\n${requests.map(describeCall).join('\n')}`).toBe(true);
    has('the Plex sections', call('plex', 'GET', '/library/sections'));
    has('the movie pages', call('plex', 'GET', '/library/sections/1/all', { type: '1' }));
    has('the show pages', call('plex', 'GET', '/library/sections/2/all', { type: '2' }));
    has('the Radarr movies', call('radarr', 'GET', '/api/v3/movie'));
    has('the Radarr root folders', call('radarr', 'GET', '/api/v3/rootfolder'));
    has('the Sonarr series', call('sonarr', 'GET', '/api/v3/series'));
    has('the Sonarr root folders', call('sonarr', 'GET', '/api/v3/rootfolder'));
    has('the Overseerr requests', call('overseerr', 'GET', '/api/v1/request'));
    has('the Tautulli history', call('tautulli', 'GET', '/api/v2', { cmd: 'get_history' }));
    // plex.tv: the user list only; the read does not call shared_servers
    const plexTv = requests.filter((request) => request.mock === 'plexTv');
    expect(plexTv.length).toBeGreaterThan(0);
    expect(plexTv.filter((request) => request.method !== 'GET' || request.path !== '/api/users').map(describeCall)).toEqual([]);
  });

  test('approving the batch deletes the movie through Radarr after the pre-delete checks', async ({ adminPage: page }) => {
    test.setTimeout(240_000);
    const pipeline = movie('pipeline');
    const batch = `admin-cleanup-batch-${IDS.batch}`;
    await page.goto('/admin/cleanup?tab=leaving-soon');
    await expect(page.getByTestId(batch).getByRole('heading', { name: '1 movie waits for your approval' })).toBeVisible({
      timeout: WAIT_TIMEOUTS.ADMIN_CONTENT,
    });
    await expect(page.getByTestId(`${batch}-table`)).toContainText(pipeline.title);
    const approve = page.getByTestId(`${batch}-approve`);
    await expect(approve).toContainText('Approve and delete 1 movie');
    // The footer waits until the client read the stored selection
    await expect(approve).not.toHaveAttribute('aria-disabled', 'true');
    await clearLogs();

    const dialog = page.getByTestId('admin-cleanup-approve-dialog');
    await pressUntil(page, `${batch}-approve`, () => dialog.isVisible());
    await expect(dialog).toContainText('Delete 1 movie and its files in Radarr?');
    await expect(dialog.getByTestId('admin-cleanup-approve-titles')).toContainText(pipeline.title);
    const confirm = page.getByTestId('admin-cleanup-approve-confirm');
    await expect(confirm).toHaveText(/^Delete 1 movie/);
    await confirm.click();
    await expect(dialog).toHaveCount(0, { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

    await expect.poll(async () => (await pipelineOutcomes()).length, { timeout: 90_000, message: 'the outcome row' }).toBeGreaterThan(0);
    expect(await pipelineOutcomes()).toEqual([{ kind: 'deleted', reason: 'deleted' }]);

    const rk = pipeline.ratingKey;
    const collection = CLEANUP_COLLECTION.ratingKey;
    const requests = await allRequests();
    const radarrDelete = call('radarr', 'DELETE', `/api/v3/movie/${pipeline.arr.id}`);
    // Exactly one delete of the seeded movie, with its files and an import list exclusion
    expect(requests.filter(radarrDelete).map((request) => request.query)).toEqual([{ deleteFiles: 'true', addImportExclusion: 'true' }]);
    // The pre-delete re-read in order, then the collection item removal before the Radarr delete
    inOrder(requests, [
      ['the Radarr record', call('radarr', 'GET', `/api/v3/movie/${pipeline.arr.id}`)],
      ['the Plex item and its files', call('plex', 'GET', `/library/metadata/${rk}`)],
      ['the Tautulli history of its key', call('tautulli', 'GET', '/api/v2', { cmd: 'get_history', rating_key: rk })],
      ['the Plex sessions', call('plex', 'GET', '/status/sessions')],
      ['the collection item removal', call('plex', 'DELETE', `/library/collections/${collection}/items/${rk}`)],
      ['the Radarr delete', radarrDelete],
    ]);
    // Media cleanup never removes anything in Overseerr, and the kept title stays
    expect(requests.filter(call('overseerr', 'DELETE', /.*/)).map(describeCall)).toEqual([]);
    const kept = new RegExp(`^/api/v3/(movie|moviefile)/${movie('kept').arr.id}$`);
    expect(requests.filter((request) => request.mock === 'radarr' && kept.test(request.path)).map(describeCall)).toEqual([]);

    // After the outcome: the availability sync, the folder scan, then the guarded delete of the empty collection
    const later: [string, Match][] = [
      ['the folder scan', call('plex', 'GET', `/library/sections/${CLEANUP_COLLECTION.sectionId}/refresh`, { path: pipeline.arr.path })],
      ['the collection guard read', call('plex', 'GET', `/library/metadata/${collection}`)],
      ['the collection delete', call('plex', 'DELETE', `/library/collections/${collection}`)],
    ];
    const sync = call('overseerr', 'POST', '/api/v1/settings/jobs/availability-sync/run');
    await expect
      .poll(async () => {
        const now = await allRequests();
        return [sync, ...later.map(([, match]) => match)].map((match) => now.some(match));
      }, { timeout: 60_000, message: 'the availability sync, the folder scan and the collection delete' })
      .toEqual([true, true, true, true]);
    const after = await allRequests();
    const [scanSeq] = inOrder(after, later);
    expect(after.find(radarrDelete)?.seq ?? Infinity).toBeLessThan(scanSeq);
    // Nothing deletes a Plex item: every Plex DELETE is a collection route
    const plexDeletes = after.filter((request) => request.mock === 'plex' && request.method === 'DELETE');
    expect(plexDeletes.filter((request) => !request.path.startsWith('/library/collections/')).map(describeCall)).toEqual([]);
  });
});
