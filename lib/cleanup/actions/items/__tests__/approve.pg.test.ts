/**
 * @jest-environment node
 */

/**
 * The item actions against a second writer on PostgreSQL (TS 16.3, 10.3,
 * delivery-r6-7, safety-r5-3, safety-r6-1, safety-r7-2, architecture-r7-1).
 *
 * 1. A second client moves the `leaveOn` of one of 150 batch rows and holds
 *    the row lock. The approval waits on it. After the commit, PostgreSQL
 *    checks the approval's `where` again, the total is short, and nothing is
 *    approved: `CLEANUP_REVIEW_STALE`.
 * 2. A season postpone whose show row a second client writes to `deleting`
 *    rolls the key back and counts it in `skipped`.
 * 3. A season postpone with a `held` show moves the season and leaves the
 *    show. With a show whose date is already later, the show is unchanged
 *    and nothing is skipped.
 * 4. After a 30-day season postpone while its show was held, the entry
 *    approval of the show starts the show at its show floor.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only rows it created, keyed by its own run prefix, and puts the
 * shared settings row back as it found it.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { describePg } from "@/__tests__/helpers/integration"
import { buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import { approveDeletionBatch } from "@/lib/cleanup/actions/items/approve"
import { approveEntryBatch } from "@/lib/cleanup/actions/items/entry"
import { postponeItems } from "@/lib/cleanup/actions/items/postpone"
import { keysHash } from "@/lib/cleanup/keys-hash"
import { batchHash } from "@/lib/cleanup/run/batches"
import { type CleanupItem, type CleanupSettings, type Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `cleanup-items-${randomUUID().slice(0, 8)}`
const ADMIN = `${RUN}-admin`
const MOVIE_RULE = `${RUN}-movies`
const SEASON_RULE = `${RUN}-seasons`
const SHOW_RULE = `${RUN}-shows`
const ZONE = process.env.TZ || "UTC"
const today = () => dayKey(Date.now(), ZONE)

const definitions = {
  [MOVIE_RULE]: buildDefinition(),
  [SEASON_RULE]: buildDefinition({ level: "season", libraries: ["2"], then: { graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: false } }),
  [SHOW_RULE]: buildDefinition({ level: "show", libraries: ["2"], then: { graceDays: 10, action: "show.delete", importListExclusion: false } }),
}

/** A row of this suite, as Prisma creates it: `movie:tmdb:<run>-1`, `show:tvdb:<run>-9`, `season:tvdb:<run>-9:2`. */
function row(key: string, overrides: Partial<CleanupItem> = {}): Prisma.CleanupItemCreateManyInput {
  const item = rowOf(key, overrides)
  return { ...item, arr: item.arr as Prisma.InputJsonValue, why: item.why as Prisma.InputJsonValue }
}

function rowOf(key: string, overrides: Partial<CleanupItem>): CleanupItem {
  const [level, kind, id] = key.split(":")
  const season = level === "season" ? Number(key.split(":")[3]) : null
  return buildCleanupItem({ id: `${RUN}-${key}`, itemKey: key, level, titleKey: `${kind}:${id}`, seasonNumber: season, state: "leaving",
    needsApproval: true, leaveOn: addDays(today(), -1), firstLeaveOn: addDays(today(), -1), ...overrides })
}
const movieKey = (n: number) => `movie:tmdb:${RUN}-${n}`
const SHOW = `show:tvdb:${RUN}-9`
const SEASON = `season:tvdb:${RUN}-9:2`
const read = (itemKey: string) => mockDb.cleanupItem.findUnique({ where: { itemKey } })
const ctx = () => ({ userId: ADMIN, now: new Date() })

/** Polls until a session of this database waits on a lock (the action meets the second client's row lock). */
async function waitForLockWait(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const rows = await mockDb.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if (rows[0]?.n > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("No session waited on a lock")
}

/** A second client that writes `data` to one row in an open transaction, and commits when the test says so. */
function secondWriter(itemKey: string, data: Prisma.CleanupItemUpdateInput) {
  let commit: () => void = () => {}
  const gate = new Promise<void>((resolve) => (commit = resolve))
  let written: () => void = () => {}
  const ready = new Promise<void>((resolve) => (written = resolve))
  const done = mockDb.$transaction(async (tx) => {
    await tx.cleanupItem.update({ where: { itemKey }, data })
    written()
    await gate
  }, { timeout: 30_000 })
  return { ready, commit, done }
}

describePg("media cleanup item actions on PostgreSQL", (databaseUrl) => {
  let settings: CleanupSettings | null = null

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    settings = await mockDb.cleanupSettings.findUnique({ where: { id: "cleanup" } })
    const live = { enabled: true, pausedAt: null, holdUntil: null, runClaimAt: null }
    await mockDb.cleanupSettings.upsert({ where: { id: "cleanup" }, create: { id: "cleanup", ...live }, update: live })
    await mockDb.user.create({ data: { id: ADMIN, name: `${RUN} admin`, isAdmin: true } })
    for (const [id, definition] of Object.entries(definitions)) {
      await mockDb.cleanupRule.create({ data: { id, name: id, mode: "reviewFirst", definition: definition as Prisma.InputJsonValue, origin: { kind: "blank" },
        createdBy: ADMIN, createdAt: new Date("2026-01-01T00:00:00Z") } })
    }
  })

  afterEach(async () => {
    await mockDb.cleanupItem.deleteMany({ where: { id: { startsWith: RUN } } })
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.cleanupOutcome.deleteMany({ where: { itemKey: { contains: RUN } } })
    await mockDb.cleanupRule.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.auditLog.deleteMany({ where: { actorUserId: ADMIN } })
    await mockDb.user.deleteMany({ where: { id: ADMIN } })
    if (settings) {
      const { enabled, enabledAt, pausedAt, pausedBy, holdUntil, runClaimAt, readClaimAt, collectionsClaimAt, collectionsDirtyAt, updatedBy } = settings
      await mockDb.cleanupSettings.update({ where: { id: "cleanup" }, data: { enabled, enabledAt, pausedAt, pausedBy, holdUntil, runClaimAt, readClaimAt,
        collectionsClaimAt, collectionsDirtyAt, updatedBy, options: settings.options as Prisma.InputJsonValue, runtime: settings.runtime as Prisma.InputJsonValue } })
    } else {
      await mockDb.cleanupSettings.deleteMany({ where: { id: "cleanup" } })
    }
    await mockDb.$disconnect()
  })

  it("approves nothing when a second client moves one of 150 batch rows during the approval (CLEANUP_REVIEW_STALE)", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => row(movieKey(i), { ruleIds: [MOVIE_RULE], sizeBytes: BigInt(150 - i) * 1024n ** 3n }))
    await mockDb.cleanupItem.createMany({ data: rows })
    const input = { batchId: `deletion-${MOVIE_RULE}`, count: 150, keysHash: batchHash(rows.map((r) => ({ itemKey: r.itemKey, action: r.action, importListExclusion: r.importListExclusion ?? false }))), excludeKeys: [],
      selected: { count: 150, action: "movie.delete" as const, exclusionCount: 0 }, reviewedAt: new Date().toISOString(), typedCount: 150 }

    const writer = secondWriter(movieKey(120), { leaveOn: addDays(today(), 14) })
    await writer.ready
    const approval = approveDeletionBatch(input, ctx())
    await waitForLockWait()
    writer.commit()
    await writer.done

    await expect(approval).resolves.toEqual({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    expect(await mockDb.cleanupItem.count({ where: { id: { startsWith: RUN }, state: "approved" } })).toBe(0)
  })

  it("rolls a season postpone back into skipped while a second client writes its show to deleting (safety-r5-5)", async () => {
    await mockDb.cleanupItem.createMany({ data: [
      row(SEASON, { ruleIds: [SEASON_RULE], action: "season.unmonitorDeleteFiles" }),
      row(SHOW, { ruleIds: [SHOW_RULE], action: "show.delete", needsApproval: false }),
      row(movieKey(1), { ruleIds: [MOVIE_RULE] }),
    ] })
    const writer = secondWriter(SHOW, { state: "deleting" })
    await writer.ready
    const postpone = postponeItems({ itemKeys: [SEASON, movieKey(1)], days: 7 }, ctx())
    await waitForLockWait()
    writer.commit()
    await writer.done

    await expect(postpone).resolves.toMatchObject({ success: true, data: { postponed: 1, skipped: 1 } })
    expect(await read(SEASON)).toMatchObject({ leaveOn: addDays(today(), -1), postponedAt: null })
    expect(await read(movieKey(1))).toMatchObject({ leaveOn: addDays(today(), 7) })
  })

  it("moves a season and leaves a held show unchanged, and leaves a show whose date is already later (safety-r6-1, architecture-r7-1)", async () => {
    await mockDb.cleanupItem.createMany({ data: [
      row(SEASON, { ruleIds: [SEASON_RULE], action: "season.unmonitorDeleteFiles" }),
      row(SHOW, { ruleIds: [SHOW_RULE], state: "held", leaveOn: null, firstLeaveOn: null, heldAt: new Date(), action: "show.delete" }),
    ] })
    const held = await read(SHOW)
    await expect(postponeItems({ itemKeys: [SEASON], days: 7 }, ctx())).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
    expect(await read(SEASON)).toMatchObject({ leaveOn: addDays(today(), 7) })
    expect(await read(SHOW)).toEqual(held)

    await mockDb.cleanupItem.update({ where: { itemKey: SHOW }, data: { state: "leaving", leaveOn: addDays(today(), 60), heldAt: null } })
    const later = await read(SHOW)
    await expect(postponeItems({ itemKeys: [SEASON], days: 7 }, ctx())).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
    expect(await read(SEASON)).toMatchObject({ leaveOn: addDays(today(), 14) })
    expect(await read(SHOW)).toEqual(later)
  })

  it("starts a held show at its show floor when its entry batch is approved after a season postpone (safety-r7-2)", async () => {
    await mockDb.cleanupItem.createMany({ data: [
      row(SEASON, { ruleIds: [SEASON_RULE], action: "season.unmonitorDeleteFiles" }),
      row(SHOW, { ruleIds: [SHOW_RULE], state: "held", leaveOn: null, firstLeaveOn: null, heldAt: new Date(), enteredAt: null, action: "show.delete" }),
    ] })
    await expect(postponeItems({ itemKeys: [SEASON], days: 30 }, ctx())).resolves.toMatchObject({ data: { postponed: 1 } })

    const entry = { batchId: `entry-${SHOW_RULE}`, count: 1, keysHash: keysHash([SHOW]), excludeKeys: [], reviewedAt: new Date().toISOString() }
    await expect(approveEntryBatch(entry, ctx())).resolves.toEqual({ success: true, data: { joined: 1 } })

    const [season, show] = await Promise.all([read(SEASON), read(SHOW)])
    expect(season?.leaveOn).toBe(addDays(today(), 30))
    expect(show).toMatchObject({ state: "leaving", heldAt: null })
    expect(show!.leaveOn! >= season!.leaveOn!).toBe(true)
    expect(await mockDb.cleanupSettings.findUnique({ where: { id: "cleanup" }, select: { runClaimAt: true } })).toEqual({ runClaimAt: null })
  })
})
