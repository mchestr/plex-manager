/**
 * @jest-environment node
 */

/**
 * The deleting check of a member Keep against the act step on PostgreSQL
 * (TS 16.3, 10.3 `keepCleanupTitle` step 5, E33, safety-r3-1, deviation
 * D18). The act step's writes are made here with Prisma, as the act step
 * makes them, so this suite needs no other wave 4 module.
 *
 * 1. A second client writes `deleting` on the show row between the Keep's
 *    read and its transaction: the Keep of a season returns
 *    `CLEANUP_DELETING`, and no Keep row exists.
 * 2. The same while the second client still holds its row lock: the Keep's
 *    exit of the show waits, PostgreSQL checks the `where` again after the
 *    commit, the exit matches zero rows, and the Keep rolls back.
 * 3. The Keep commits first: the act step's optimistic `deleting` write
 *    (`{ id, updatedAt }`) matches zero rows, so the act step skips the show.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only rows it created, keyed by its own run id, and puts the shared
 * settings row back as it found it.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import { getServerSession } from "next-auth"

import { keepCleanupTitle } from "@/actions/cleanup-keeps"
import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { describePg } from "@/__tests__/helpers/integration"
import { memberCleanupAccess } from "@/lib/cleanup/member/access"
import { type CleanupItem, type CleanupSettings, type Prisma, PrismaClient } from "@/lib/generated/prisma/client"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(async () => ({ ok: true, remaining: 10 })), actionClientIp: jest.fn() }))
jest.mock("@/lib/actions/entitlement", () => ({ hasEntitlement: jest.fn(async () => true), NOT_ENTITLED_MESSAGE: "This needs an active membership." }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn(async () => ({ url: "http://plex.test", token: "t", adminPlexUserId: "1" })) }))
jest.mock("@/lib/cleanup/member/access", () => ({ ...jest.requireActual("@/lib/cleanup/member/access"), memberCleanupAccess: jest.fn() }))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: jest.fn(async () => ({ flagged: true, queued: false })) }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

// Item keys hold letters and digits only (`itemKeySchema`)
const RUN = `k${randomUUID().replaceAll("-", "").slice(0, 12)}`
const MEMBER = `${RUN}-member`
const SHOW = `show:tvdb:${RUN}`
const SEASON = `season:tvdb:${RUN}:2`

function row(key: string, overrides: Partial<CleanupItem> = {}): Prisma.CleanupItemCreateManyInput {
  const [level, kind, id, season] = key.split(":")
  const item = buildCleanupItem({ id: `${RUN}-${level}`, itemKey: key, level, titleKey: `${kind}:${id}`, seasonNumber: season ? Number(season) : null,
    sectionId: "2", state: "leaving", ruleIds: [`${RUN}-rule`], leaveOn: "2026-12-08", firstLeaveOn: "2026-12-08", ...overrides })
  return { ...item, arr: item.arr as Prisma.InputJsonValue, why: item.why as Prisma.InputJsonValue }
}

const read = (itemKey: string) => mockDb.cleanupItem.findUnique({ where: { itemKey } })
const keepRows = () => mockDb.cleanupProtection.findMany({ where: { memberId: MEMBER } })

/** Polls until a session of this database waits on a lock. */
async function waitForLockWait(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const rows = await mockDb.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if (rows[0]?.n > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("No session waited on a lock")
}

describePg("member Keeps against the act step on PostgreSQL", (databaseUrl) => {
  let settings: CleanupSettings | null = null

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    settings = await mockDb.cleanupSettings.findUnique({ where: { id: "cleanup" } })
    const live = { enabled: true, pausedAt: null, holdUntil: null, options: {} }
    await mockDb.cleanupSettings.upsert({ where: { id: "cleanup" }, create: { id: "cleanup", ...live }, update: live })
    await mockDb.user.create({ data: { id: MEMBER, name: `${RUN} member`, plexUserId: `${RUN}-plex` } })
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: MEMBER, isAdmin: false }, expires: "2099-01-01" })
  })

  beforeEach(async () => {
    jest.mocked(memberCleanupAccess).mockReset()
    await mockDb.cleanupItem.createMany({ data: [row(SHOW), row(SEASON)] })
  })

  afterEach(async () => {
    await mockDb.cleanupItem.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.cleanupOutcome.deleteMany({ where: { itemKey: { contains: RUN } } })
    await mockDb.cleanupProtection.deleteMany({ where: { memberId: MEMBER } })
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.auditLog.deleteMany({ where: { actorUserId: MEMBER } })
    await mockDb.user.deleteMany({ where: { id: MEMBER } })
    if (settings) {
      const { enabled, pausedAt, holdUntil } = settings
      await mockDb.cleanupSettings.update({ where: { id: "cleanup" }, data: { enabled, pausedAt, holdUntil, options: settings.options as Prisma.InputJsonValue } })
    } else {
      await mockDb.cleanupSettings.deleteMany({ where: { id: "cleanup" } })
    }
    await mockDb.$disconnect()
  })

  it("refuses a Keep of a season when the show row turns deleting between the Keep's read and its transaction", async () => {
    jest.mocked(memberCleanupAccess).mockImplementation(async () => {
      await mockDb.cleanupItem.update({ where: { itemKey: SHOW }, data: { state: "deleting" } })
      return "all"
    })
    expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: false, code: "CLEANUP_DELETING" })
    expect(await keepRows()).toEqual([])
    expect(await read(SEASON)).toMatchObject({ state: "leaving" })
    expect(await read(SHOW)).toMatchObject({ state: "deleting" })
    expect(await mockDb.cleanupOutcome.count({ where: { itemKey: { contains: RUN } } })).toBe(0)
  })

  it("refuses the Keep when its exit waits on the act step's uncommitted deleting write", async () => {
    let commit: () => void = () => {}
    const gate = new Promise<void>((resolve) => (commit = resolve))
    let act: Promise<unknown> = Promise.resolve()
    jest.mocked(memberCleanupAccess).mockImplementation(async () => {
      let written: () => void = () => {}
      const ready = new Promise<void>((resolve) => (written = resolve))
      act = mockDb.$transaction(async (tx) => {
        await tx.cleanupItem.update({ where: { itemKey: SHOW }, data: { state: "deleting" } })
        written()
        await gate
      }, { timeout: 30_000 })
      await ready
      return "all"
    })
    const keep = keepCleanupTitle({ itemKey: SEASON })
    await waitForLockWait()
    commit()
    await act
    expect(await keep).toMatchObject({ success: false, code: "CLEANUP_DELETING" })
    expect(await keepRows()).toEqual([])
    expect(await read(SEASON)).toMatchObject({ state: "leaving" })
  })

  it("makes the act step's optimistic deleting write match zero rows when the Keep commits first", async () => {
    jest.mocked(memberCleanupAccess).mockResolvedValue("all")
    const seen = await read(SHOW)
    if (!seen) throw new Error("The show row is missing")
    expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: true })
    const { count } = await mockDb.cleanupItem.updateMany({ where: { id: seen.id, updatedAt: seen.updatedAt }, data: { state: "deleting" } })
    expect(count).toBe(0)
    expect(await read(SHOW)).toBeNull()
    expect(await read(SEASON)).toBeNull()
    expect(await keepRows()).toEqual([expect.objectContaining({ itemKey: SEASON, status: "active", activeKey: `keep:${SEASON}:${MEMBER}` })])
    const outcomes = await mockDb.cleanupOutcome.findMany({ where: { itemKey: { in: [SHOW, SEASON] } }, select: { itemKey: true, kind: true, reason: true } })
    expect(outcomes.sort((a, b) => a.itemKey.localeCompare(b.itemKey))).toEqual([
      { itemKey: SEASON, kind: "rescued", reason: "kept" },
      { itemKey: SHOW, kind: "rescued", reason: "kept" },
    ])
  })
})
