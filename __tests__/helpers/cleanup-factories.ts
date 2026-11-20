/**
 * Factories for full media cleanup rows (TS 2.2), built from partial
 * overrides in the style of `./factories`, so typed mocks
 * (`prismaMock.cleanupItem.findMany.mockResolvedValue([buildCleanupItem()])`)
 * get a valid shape without casts.
 *
 * The defaults describe one invented movie, one rule, one run and one library
 * read, linked by id. Each `Json` column holds a valid stored document
 * (TS 3.2 and 3.4). The rule starts in Dry run, as a new rule does: set
 * `mode` for a test that needs a live rule. The file imports only Prisma
 * types, never the cleanup contracts, so the schema commit compiles alone.
 */
import type {
  CleanupItem,
  CleanupOutcome,
  CleanupProtection,
  CleanupRule,
  CleanupRun,
  CleanupSettings,
  CleanupSnapshot,
  CleanupSnapshotPart,
} from '@/lib/generated/prisma/client'

// A fresh Date per row, so a test that mutates one cannot leak into another.
const fixedDate = () => new Date('2026-01-01T00:00:00.000Z')
const FIXED_ISO = '2026-01-01T00:00:00.000Z'
/** Unix seconds of 2019-01-01, when the movie was added. */
const ADDED_AT = 1_546_300_800
const GIB = 1024 ** 3

const MOVIE = {
  itemKey: 'movie:tmdb:101',
  level: 'movie',
  titleKey: 'tmdb:101',
  sectionId: '1',
  ratingKey: '5001',
  title: 'Example Movie',
  year: 2019,
  seasonNumber: null,
}
const MOVIE_PATH = '/media/movies/Example Movie (2019)'

/** One status per source, every one read at the fixed time (`sourceStatusSchema`). */
const sources = () =>
  (['plex', 'tautulli', 'overseerr', 'radarr', 'sonarr'] as const).map((service) => ({ service, state: 'ok', readAt: FIXED_ISO }))

/** The facts the check of the default rule saw, with no member ids (`whySnapshotSchema`). */
const whySnapshot = () => ({
  v: 1,
  snapshotId: 'cleanup-snapshot-1',
  takenAt: FIXED_ISO,
  checkedAt: FIXED_ISO,
  ruleId: 'cleanup-rule-1',
  conditions: [
    { id: 'c1', field: 'watch.lastPlayed', verdict: 'pass' },
    { id: 'c2', field: 'library.added', verdict: 'pass' },
  ],
  protections: [{ id: 'p1', verdict: 'clear' }],
  facts: {
    lastCountedAt: null,
    countedTotal: 0,
    addedPlex: ADDED_AT,
    addedArr: ADDED_AT,
    sizeBytes: 20 * GIB,
    requests: [],
    importList: false,
    showStatus: null,
    seasonsOnDisk: null,
    position: null,
    lastEpisodeAddedAt: null,
    historyStartAt: ADDED_AT,
  },
  match: { state: 'matched', by: 'tmdb', externalId: '101', service: 'radarr', arrId: 11, path: MOVIE_PATH },
  sources: sources(),
})

/** The settings row with the schema defaults: off, not paused, no claims (`lib/cleanup/settings`). */
export function buildCleanupSettings(overrides: Partial<CleanupSettings> = {}): CleanupSettings {
  return {
    id: 'cleanup',
    enabled: false,
    enabledAt: null,
    pausedAt: null,
    pausedBy: null,
    holdUntil: null,
    runClaimAt: null,
    readClaimAt: null,
    collectionsClaimAt: null,
    collectionsDirtyAt: null,
    options: {},
    runtime: {},
    updatedAt: fixedDate(),
    updatedBy: null,
    ...overrides,
  }
}

/** A Dry run movie rule: last played more than a year ago or never, added more than 6 months ago. */
export function buildCleanupRule(overrides: Partial<CleanupRule> = {}): CleanupRule {
  return {
    id: 'cleanup-rule-1',
    name: 'Unwatched movies',
    mode: 'dryRun',
    revision: 1,
    definition: {
      schemaVersion: 1,
      level: 'movie',
      libraries: ['1'],
      conditions: [
        { id: 'c1', field: 'watch.lastPlayed', op: 'moreThan', value: { duration: { amount: 1, unit: 'years' }, orNever: true } },
        { id: 'c2', field: 'library.added', op: 'moreThan', value: { duration: { amount: 6, unit: 'months' } } },
      ],
      protections: [{ id: 'p1', field: 'request.age', op: 'lessThan', value: { duration: { amount: 90, unit: 'days' } } }],
      then: { graceDays: 14, action: 'movie.delete', importListExclusion: false },
    },
    schemaVersion: 1,
    origin: { kind: 'blank' },
    stats: {},
    turnedOnAt: null,
    lastDryRunAt: null,
    createdAt: fixedDate(),
    createdBy: 'admin-1',
    updatedAt: fixedDate(),
    updatedBy: null,
    ...overrides,
  }
}

/** The movie in Leaving soon, held by the default rule and leaving 14 days after it joined. */
export function buildCleanupItem(overrides: Partial<CleanupItem> = {}): CleanupItem {
  return {
    id: 'cleanup-item-1',
    ...MOVIE,
    episodeCount: null,
    seasonCount: null,
    sizeBytes: 20n * 1024n ** 3n,
    arr: { service: 'radarr', id: 11, titleSlug: 'example-movie-2019', path: MOVIE_PATH },
    state: 'leaving',
    ruleIds: ['cleanup-rule-1'],
    action: 'movie.delete',
    importListExclusion: false,
    needsApproval: false,
    heldAt: null,
    enteredAt: fixedDate(),
    leaveOn: '2026-01-15',
    firstLeaveOn: '2026-01-15',
    postponedAt: null,
    postponedBy: null,
    approvedAt: null,
    approvedBy: null,
    holdCode: null,
    deferredAt: null,
    failCode: null,
    failCount: 0,
    why: whySnapshot(),
    lastRunId: 'cleanup-run-1',
    checkedAt: fixedDate(),
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}

/** The movie in History: deleted on its leave date, with no approval needed. */
export function buildCleanupOutcome(overrides: Partial<CleanupOutcome> = {}): CleanupOutcome {
  return {
    id: 'cleanup-outcome-1',
    ...MOVIE,
    kind: 'deleted',
    reason: 'deleted',
    detail: null,
    ruleIds: ['cleanup-rule-1'],
    action: 'movie.delete',
    sizeBytes: 20n * 1024n ** 3n,
    freedBytes: 20n * 1024n ** 3n,
    alreadyGone: false,
    approvedBy: 'automatic',
    enteredAt: fixedDate(),
    leaveOn: '2026-01-15',
    why: whySnapshot(),
    runId: 'cleanup-run-1',
    actedAt: new Date('2026-01-15T03:00:00.000Z'),
    ...overrides,
  }
}

/**
 * An active member Keep of the movie by `user-1` (the default `buildUser`),
 * until 30 days after it was made. `activeKey` follows the `kind`, `itemKey`
 * and `memberId` overrides, so `{ kind: 'adminExclude', memberId: null }`
 * gives an exclusion.
 */
export function buildCleanupProtection(overrides: Partial<CleanupProtection> = {}): CleanupProtection {
  const itemKey = overrides.itemKey ?? MOVIE.itemKey
  const memberId = overrides.memberId === undefined ? 'user-1' : overrides.memberId
  const kind = overrides.kind ?? 'memberKeep'
  return {
    id: 'cleanup-protection-1',
    kind,
    itemKey,
    level: MOVIE.level,
    titleKey: MOVIE.titleKey,
    title: MOVIE.title,
    year: MOVIE.year,
    seasonNumber: null,
    sectionId: MOVIE.sectionId,
    ratingKey: MOVIE.ratingKey,
    externalIds: { tmdb: 101, imdb: 'tt0000101' },
    memberId,
    createdBy: memberId ?? 'admin-1',
    note: null,
    expiresAt: new Date('2026-01-31T00:00:00.000Z'),
    status: 'active',
    endedAt: null,
    endedBy: null,
    endedByUserId: null,
    activeKey: kind === 'memberKeep' ? `keep:${itemKey}:${memberId}` : `exclude:${itemKey}`,
    restore: null,
    createdAt: fixedDate(),
    updatedAt: fixedDate(),
    ...overrides,
  }
}

/** A finished scheduled live run of the default rule that added the movie to Leaving soon. */
export function buildCleanupRun(overrides: Partial<CleanupRun> = {}): CleanupRun {
  return {
    id: 'cleanup-run-1',
    kind: 'run',
    trigger: 'scheduled',
    actorId: null,
    snapshotId: 'cleanup-snapshot-1',
    startedAt: fixedDate(),
    finishedAt: fixedDate(),
    ruleIds: ['cleanup-rule-1'],
    checked: 1,
    matched: 1,
    joined: 1,
    held: 0,
    rescued: 0,
    deleted: 0,
    failed: 0,
    deferred: 0,
    freedBytes: 0n,
    outcome: 'finished',
    blocks: [],
    error: null,
    entries: [
      { ruleId: 'cleanup-rule-1', mode: 'automatic', matches: 1, joined: 1, held: 0, rescued: 0, deleted: 0, failed: 0, blocks: [] },
    ],
    ...overrides,
  }
}

/** A complete scheduled library read: every source ok, one movie library (`snapshotFactsSchema`). */
export function buildCleanupSnapshot(overrides: Partial<CleanupSnapshot> = {}): CleanupSnapshot {
  return {
    id: 'cleanup-snapshot-1',
    status: 'complete',
    trigger: 'scheduled',
    actorId: null,
    startedAt: fixedDate(),
    finishedAt: fixedDate(),
    sources: sources(),
    facts: {
      version: 1,
      takenAt: FIXED_ISO,
      history: { startAt: ADDED_AT, newestAt: 1_767_139_200, rows: 1, orphans: 0, usersWithPlay: 1 },
      users: { '1001': { hasAccess: true, lastPlayAt: 1_767_139_200, owner: true } },
      libraries: [
        {
          sectionId: '1',
          title: 'Movies',
          type: 'movie',
          agent: 'tv.plex.agents.movie',
          locations: ['/media/movies'],
          arr: 'radarr',
          noIds: false,
          items: 1,
          seasons: 0,
          bytes: 20 * GIB,
        },
      ],
      disk: { freeBytes: 500 * GIB, totalBytes: 4096 * GIB },
      growthBytesPerMonth: null,
      collections: [],
      membersRead: [],
      importListCount: { radarr: 0, sonarr: 0 },
      machineIdentifier: 'example-machine-id',
      labelsRead: [],
      rowBaseline: {},
    },
    ...overrides,
  }
}

/**
 * The movie part of the default read, with the movie as its one item
 * (`snapshotItemSchema`). `itemCount` follows an `items` override.
 */
export function buildCleanupSnapshotPart(overrides: Partial<CleanupSnapshotPart> = {}): CleanupSnapshotPart {
  const items = overrides.items ?? [
    {
      key: MOVIE.itemKey,
      level: 'movie',
      titleKey: MOVIE.titleKey,
      title: MOVIE.title,
      year: MOVIE.year,
      seasonNumber: null,
      showKey: null,
      sectionId: MOVIE.sectionId,
      ratingKey: MOVIE.ratingKey,
      copies: [{ ratingKey: MOVIE.ratingKey, sectionId: MOVIE.sectionId }],
      episodeKeys: [],
      ids: { tmdb: 101, imdb: 'tt0000101' },
      added: { plex: ADDED_AT, arr: ADDED_AT },
      sizeBytes: 20 * GIB,
      episodeCount: null,
      match: { state: 'matched', by: 'tmdb' },
      arr: {
        service: 'radarr',
        id: 11,
        titleSlug: 'example-movie-2019',
        path: MOVIE_PATH,
        root: '/media/movies',
        tags: [],
        importList: false,
        monitored: true,
        fileId: 21,
      },
      show: null,
      position: null,
      plays: { lastCountedAt: null, countedAt: [], viewers: [] },
      requests: [],
      collections: [],
      labels: [],
    },
  ]
  return {
    id: 'cleanup-snapshot-part-1',
    snapshotId: 'cleanup-snapshot-1',
    level: 'movie',
    itemCount: Array.isArray(items) ? items.length : 0,
    items,
    ...overrides,
  }
}
