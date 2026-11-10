/**
 * @jest-environment node
 */

/**
 * The member Keep actions of media cleanup (TS 10.2, 10.3, 13.2, E30, E33):
 * signed-out and refused callers, each refusal code, the Keep limit, a
 * repeated Keep, the cascade exits, the deleting check and its retry, both
 * restore paths of Undo, the audit rows and the collection sync.
 *
 * The database is a small in-memory table behind the shared Prisma mock. A
 * transaction runs on the same table and puts it back when its body throws,
 * as PostgreSQL rolls back, so "no Keep row" is a fact of the table. Hooks
 * change rows at the start of a transaction, as a second writer does.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { keepCleanupTitle, removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { buildCleanupItem, buildCleanupOutcome, buildCleanupProtection, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { buildMovieItem, buildRestoreItem, buildSeasonItem, buildShowItem } from "@/lib/cleanup/__tests__/helpers/builders"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { memberCleanupAccess } from "@/lib/cleanup/member/access"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import { getActiveService } from "@/lib/data/active-service"
import { type CleanupItem, type CleanupProtection, type CleanupSettings, Prisma } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/actions/entitlement", () => ({ hasEntitlement: jest.fn(), NOT_ENTITLED_MESSAGE: "This needs an active membership." }))
const mockLog = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: (...args: unknown[]) => mockLog(...args),
  recordAuditEvent: jest.fn(),
}))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: jest.fn() }))
jest.mock("@/lib/cleanup/member/access", () => ({ ...jest.requireActual("@/lib/cleanup/member/access"), memberCleanupAccess: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadSnapshotLevel: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const MEMBER = "member-1"
const SESSION = { user: { id: MEMBER, isAdmin: false }, expires: "2099-01-01" }
const MOVIE = "movie:tmdb:1001"
const SHOW = "show:tvdb:2002"
const SEASON = "season:tvdb:2002:1"
const SEASON_2 = "season:tvdb:2002:2"
const DAY_MS = 86_400_000
const DELETING_WORDS = "This title, or part of it, is being deleted now. Try again in a few minutes."

// ---- The in-memory table ------------------------------------------------------

type Where = Record<string, unknown>
interface Store {
  items: CleanupItem[]
  protections: CleanupProtection[]
  outcomes: Record<string, unknown>[]
  settings: CleanupSettings
  rules: { id: string; mode: string }[]
  runs: { kind: string; startedAt: Date }[]
  plexUserId: string | null
  /** At the start of each transaction (the count of transactions so far). */
  onTransaction?: (n: number) => void
  /** Before each `cleanupProtection.create`. Throw to fail the write. */
  beforeKeep?: () => void
  /** Before each `cleanupItem.create`. Throw to fail the write. */
  beforeCreate?: () => void
  /** After a transaction rolled back, as a second writer that commits. */
  afterRollback?: () => void
}

let store: Store
let clock = 0
let transactions = 0
const tick = () => new Date(Date.UTC(2026, 0, 1) + ++clock)

const order = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : String(a).localeCompare(String(b)))

function test(value: unknown, cond: unknown): boolean {
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime()
  if (cond === null || typeof cond !== "object") return value === cond
  const c = cond as Record<string, unknown>
  if ("in" in c) return (c.in as unknown[]).includes(value)
  if ("not" in c) return !test(value, c.not)
  if (value === null || value === undefined) return false
  if ("gt" in c) return order(value, c.gt) > 0
  if ("lt" in c) return order(value, c.lt) < 0
  return "lte" in c && order(value, c.lte) <= 0
}

function matches(row: object, where: Where = {}): boolean {
  const record = row as Record<string, unknown>
  return Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w))
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w))
    return test(record[key], cond)
  })
}

const copy = <T extends object>(row: T | undefined): T | null => (row ? { ...row } : null)
const saved = () => ({ items: store.items.map((r) => ({ ...r })), protections: store.protections.map((p) => ({ ...p })), outcomes: [...store.outcomes] })
const unique = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" })

function wire() {
  const db = prismaMock
  db.config.findUnique.mockResolvedValue({ timezone: "UTC" } as never)
  db.cleanupSettings.findUnique.mockImplementation((async () => ({ ...store.settings })) as never)
  db.user.findUnique.mockImplementation((async () => ({ plexUserId: store.plexUserId })) as never)
  db.cleanupRun.count.mockImplementation((async ({ where }: { where: Where }) => store.runs.filter((r) => matches(r, where)).length) as never)
  db.cleanupRule.count.mockImplementation((async ({ where }: { where: Where }) => store.rules.filter((r) => matches(r, where)).length) as never)
  db.cleanupOutcome.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
    store.outcomes.push({ ...data, actedAt: tick() })
    return { id: `outcome-${store.outcomes.length}` }
  }) as never)
  db.cleanupOutcome.findFirst.mockImplementation((async ({ where }: { where: Where }) =>
    copy([...store.outcomes].reverse().find((o) => matches(o, where)))) as never)
  db.cleanupItem.findUnique.mockImplementation((async ({ where }: { where: Where }) => copy(store.items.find((r) => matches(r, where)))) as never)
  db.cleanupItem.findMany.mockImplementation((async ({ where }: { where?: Where }) => store.items.filter((r) => matches(r, where)).map((r) => ({ ...r }))) as never)
  db.cleanupItem.count.mockImplementation((async ({ where }: { where: Where }) => store.items.filter((r) => matches(r, where)).length) as never)
  db.cleanupItem.updateMany.mockImplementation((async ({ where, data }: { where: Where; data: Partial<CleanupItem> }) => {
    const hit = store.items.filter((r) => matches(r, where))
    for (const row of hit) Object.assign(row, data, { updatedAt: tick() })
    return { count: hit.length }
  }) as never)
  db.cleanupItem.deleteMany.mockImplementation((async ({ where }: { where: Where }) => {
    const before = store.items.length
    store.items = store.items.filter((r) => !matches(r, where))
    return { count: before - store.items.length }
  }) as never)
  db.cleanupItem.create.mockImplementation((async ({ data }: { data: Partial<CleanupItem> }) => {
    store.beforeCreate?.()
    const row = buildCleanupItem({ ...data, id: `restored-${data.itemKey}`, updatedAt: tick() })
    store.items.push(row)
    return row
  }) as never)
  db.cleanupProtection.findUnique.mockImplementation((async ({ where }: { where: { activeKey: string } }) =>
    copy(store.protections.find((p) => p.activeKey === where.activeKey))) as never)
  db.cleanupProtection.findFirst.mockImplementation((async ({ where }: { where: Where }) => copy(store.protections.find((p) => matches(p, where)))) as never)
  db.cleanupProtection.count.mockImplementation((async ({ where }: { where: Where }) => store.protections.filter((p) => matches(p, where)).length) as never)
  db.cleanupProtection.update.mockImplementation((async ({ where, data }: { where: { id: string }; data: Partial<CleanupProtection> }) => {
    const row = store.protections.find((p) => p.id === where.id)
    if (row) Object.assign(row, data)
    return row
  }) as never)
  db.cleanupProtection.updateMany.mockImplementation((async ({ where, data }: { where: Where; data: Partial<CleanupProtection> }) => {
    const hit = store.protections.filter((p) => matches(p, where))
    for (const row of hit) Object.assign(row, data)
    return { count: hit.length }
  }) as never)
  db.cleanupProtection.create.mockImplementation((async ({ data }: { data: Partial<CleanupProtection> }) => {
    store.beforeKeep?.()
    const row = buildCleanupProtection({ ...data, id: `keep-${store.protections.length + 1}`, createdAt: new Date() })
    store.protections.push(row)
    return row
  }) as never)
  db.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
    transactions += 1
    store.onTransaction?.(transactions)
    const before = saved()
    try {
      return await fn(prismaMock)
    } catch (error) {
      Object.assign(store, before)
      store.afterRollback?.()
      throw error
    }
  }) as never)
}

/** An item row by key. A season key `season:tvdb:2002:1` gets its show's title key. */
function item(key: string, overrides: Partial<CleanupItem> = {}): CleanupItem {
  const [level, kind, id, season] = key.split(":")
  return buildCleanupItem({
    id: `id-${key}`, itemKey: key, level, titleKey: `${kind}:${id}`, seasonNumber: season ? Number(season) : null, title: `Invented ${key}`,
    sectionId: level === "movie" ? "1" : "2", state: "leaving", ruleIds: ["rule-1"], leaveOn: "2026-12-08", firstLeaveOn: "2026-12-08",
    updatedAt: tick(), ...overrides,
  })
}
const row = (key: string) => store.items.find((r) => r.itemKey === key)
const audits = (type: AuditEventType) => mockLog.mock.calls.filter(([t]) => t === type).map(([, actor, details]) => ({ actor, ...(details as object) }))
const options = (members: Record<string, unknown> = {}) => ({ members: { keepsEnabled: true, keepDays: 90, keepLimit: 2, pageEnabled: true, ...members } })

function setup(items: CleanupItem[], settings: Partial<CleanupSettings> = {}) {
  store = { items, protections: [], outcomes: [], settings: buildCleanupSettings({ enabled: true, options: options(), ...settings }),
    rules: [{ id: "rule-1", mode: "reviewFirst" }], runs: [], plexUserId: "100" }
}

/** The newest library data of each level, with the sections whose listing carried labels. */
function snapshot(items: SnapshotItem[], labelsRead: string[] = []) {
  jest.mocked(loadSnapshotLevel).mockImplementation((async (level: string) => ({
    byKey: new Map(items.filter((i) => i.level === level).map((i) => [i.key, i])),
    header: { facts: { labelsRead } },
  })) as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  transactions = 0
  jest.mocked(getServerSession).mockResolvedValue(SESSION)
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  jest.mocked(consume).mockResolvedValue({ ok: true, remaining: 10 } as never)
  jest.mocked(requestCollectionSync).mockResolvedValue({ flagged: true, queued: true })
  jest.mocked(getActiveService).mockResolvedValue({ url: "http://plex.test", token: "t", adminPlexUserId: "1" } as never)
  jest.mocked(memberCleanupAccess).mockResolvedValue("all")
  snapshot([buildMovieItem(), buildShowItem(), buildSeasonItem(buildShowItem(), 1)])
  setup([item(MOVIE)])
  wire()
})

// ---- Callers -------------------------------------------------------------------

describe("refused callers", () => {
  const CALLS = [
    ["keepCleanupTitle", () => keepCleanupTitle({ itemKey: MOVIE })],
    ["removeMyCleanupKeep", () => removeMyCleanupKeep({ keepId: "keep-1" })],
  ] as const

  it.each(CALLS)("%s refuses a signed-out caller", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    expect(await call()).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
  })

  it.each(CALLS)("%s needs an active membership", async (_name, call) => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)
    expect(await call()).toMatchObject({ success: false, code: "NOT_ENTITLED" })
    expect(hasEntitlement).toHaveBeenCalledWith(MEMBER, "full")
  })

  it.each(CALLS)("%s spends the member's cleanup:keep limit", async (_name, call) => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 60 } as never)
    expect(await call()).toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("cleanup:keep", MEMBER)
  })

  it("refuses an item key of the wrong form", async () => {
    expect(await keepCleanupTitle({ itemKey: "movie/1001" })).toMatchObject({ success: false, code: "VALIDATION" })
  })
})

// ---- Keep ------------------------------------------------------------------------

describe("keepCleanupTitle", () => {
  it("keeps the title for the Keep length, takes it out of Leaving soon at once and audits it", async () => {
    const before = Date.now()
    const result = await keepCleanupTitle({ itemKey: MOVIE })
    expect(result).toMatchObject({ success: true, data: { keepId: "keep-1" } })
    const until = new Date(result.success ? result.data.until : 0).getTime()
    expect(until).toBeGreaterThanOrEqual(before + 90 * DAY_MS)
    expect(row(MOVIE)).toBeUndefined()
    expect(store.outcomes).toEqual([expect.objectContaining({ itemKey: MOVIE, kind: "rescued", reason: "kept" })])
    expect(store.protections[0]).toMatchObject({ kind: "memberKeep", memberId: MEMBER, createdBy: MEMBER, activeKey: `keep:${MOVIE}:${MEMBER}`,
      restore: expect.objectContaining({ state: "leaving", leaveOn: "2026-12-08", ruleIds: ["rule-1"] }), externalIds: { tmdb: 1001 } })
    expect(audits(AuditEventType.CLEANUP_KEEP_ADDED)).toEqual([{ actor: MEMBER, targetUserId: MEMBER, keepId: "keep-1", itemKey: MOVIE, until: expect.any(String) }])
    expect(audits(AuditEventType.CLEANUP_ITEM_RESCUED)).toEqual([])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
    expect(memberCleanupAccess).toHaveBeenCalledWith(expect.anything(), "100", { timeoutMs: 1500 })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("keeps an approved title and stores its approval for Undo", async () => {
    setup([item(MOVIE, { state: "approved", approvedAt: new Date("2026-11-01T00:00:00Z"), approvedBy: "admin-1" })])
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: true })
    expect(store.protections[0].restore).toMatchObject({ state: "approved", approvedBy: "admin-1" })
  })

  it.each([
    ["the feature is off", { enabled: false }],
    ["cleanup is paused", { pausedAt: new Date() }],
    ["member Keeps are off", { options: options({ keepsEnabled: false }) }],
    ["the Leaving soon page is off", { options: options({ pageEnabled: false }) }],
  ])("refuses with CLEANUP_NOT_LEAVING while %s", async (_case, settings) => {
    setup([item(MOVIE)], settings)
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toEqual({ success: false, code: "CLEANUP_NOT_LEAVING", error: "This title is no longer leaving soon." })
    expect(store.protections).toEqual([])
  })

  it.each([
    ["no item row", []],
    ["a held row", [item(MOVIE, { state: "held", leaveOn: null })]],
  ])("refuses with CLEANUP_NOT_LEAVING for %s", async (_case, items) => {
    setup(items)
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
  })

  it("refuses a title that is being deleted", async () => {
    setup([item(MOVIE, { state: "deleting" })])
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toEqual({ success: false, code: "CLEANUP_DELETING", error: DELETING_WORDS })
    expect(store.protections).toEqual([])
  })

  it.each([
    ["is being deleted", "deleting"],
    ["is in Leaving soon", "leaving"],
    ["is held", "held"],
  ])("gives a hidden title that %s the answer of a key with no row (no state oracle)", async (_case, state) => {
    jest.mocked(memberCleanupAccess).mockResolvedValue(new Map([["9", null]]))
    setup([item(MOVIE, { state })])
    const hidden = await keepCleanupTitle({ itemKey: MOVIE })
    expect(hidden).toEqual(await keepCleanupTitle({ itemKey: "movie:tmdb:4040" }))
    expect(hidden).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
  })

  it("gives UPSTREAM_UNAVAILABLE for a key with no row too while plex.tv does not answer", async () => {
    jest.mocked(memberCleanupAccess).mockResolvedValue(null)
    expect(await keepCleanupTitle({ itemKey: "movie:tmdb:4040" })).toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
  })

  it("refuses a title in a section that is not shared, and never says why", async () => {
    jest.mocked(memberCleanupAccess).mockResolvedValue(new Map([["9", null]]))
    const result = await keepCleanupTitle({ itemKey: MOVIE })
    expect(result).toEqual({ success: false, code: "CLEANUP_NOT_LEAVING", error: "This title is no longer leaving soon." })
    expect(store.protections).toEqual([])
    expect(row(MOVIE)).toBeDefined()
  })

  it.each([
    ["a member with no plex.tv account", () => (store.plexUserId = null)],
    ["no Plex server", () => jest.mocked(getActiveService).mockResolvedValue(null)],
  ])("refuses %s", async (_case, arrange) => {
    arrange()
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
    expect(memberCleanupAccess).not.toHaveBeenCalled()
  })

  it("gives UPSTREAM_UNAVAILABLE with no title while plex.tv does not answer", async () => {
    jest.mocked(memberCleanupAccess).mockResolvedValue(null)
    const result = await keepCleanupTitle({ itemKey: MOVIE })
    expect(result).toEqual({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "Plex did not answer. Try again in a minute." })
    expect(JSON.stringify(result)).not.toContain("Invented")
    expect(store.protections).toEqual([])
  })

  describe("a share with a label filter", () => {
    beforeEach(() => jest.mocked(memberCleanupAccess).mockResolvedValue(new Map([["1", new Set(["untranscodable"])], ["2", new Set(["hidden"])]])))

    it("keeps a title with none of the hidden labels", async () => {
      snapshot([buildMovieItem({ labels: ["kids"] })], ["1"])
      expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: true })
    })

    it("refuses a title with a hidden label", async () => {
      snapshot([buildMovieItem({ labels: ["Untranscodable"] })], ["1"])
      expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
    })

    it("reads a season's labels from its show and never loads the season part", async () => {
      setup([item(SEASON)])
      snapshot([buildShowItem({ labels: ["hidden"] })], ["2"])
      expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
      expect(loadSnapshotLevel).toHaveBeenCalledWith("show")
      expect(loadSnapshotLevel).not.toHaveBeenCalledWith("season")
    })

    it("refuses a title whose section listing carried no labels", async () => {
      snapshot([buildMovieItem()], [])
      expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
    })

    it("refuses a title that is not in the library data", async () => {
      jest.mocked(loadSnapshotLevel).mockResolvedValue(null)
      expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
    })
  })

  it("refuses at the Keep limit and counts only active Keeps that have not ended", async () => {
    const future = new Date(Date.now() + DAY_MS)
    store.protections = [
      buildCleanupProtection({ id: "a", itemKey: "movie:tmdb:1", memberId: MEMBER, expiresAt: future }),
      buildCleanupProtection({ id: "b", itemKey: "movie:tmdb:2", memberId: MEMBER, expiresAt: future }),
    ]
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toEqual({ success: false, code: "CLEANUP_KEEP_LIMIT", error: "You keep 2 titles. End a Keep to keep this one." })
    store.protections[1] = { ...store.protections[1], expiresAt: new Date(Date.now() - DAY_MS) }
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: true })
  })

  it("returns the existing Keep for a repeated Keep and writes nothing", async () => {
    store.protections = [buildCleanupProtection({ id: "keep-old", itemKey: MOVIE, memberId: MEMBER, expiresAt: new Date(Date.now() + DAY_MS) })]
    const result = await keepCleanupTitle({ itemKey: MOVIE })
    expect(result).toMatchObject({ success: true, data: { keepId: "keep-old" } })
    expect(row(MOVIE)).toBeDefined()
    expect(audits(AuditEventType.CLEANUP_KEEP_ADDED)).toEqual([])
  })

  it("ends an expired Keep of the same key before it makes the new one", async () => {
    store.protections = [buildCleanupProtection({ id: "keep-old", itemKey: MOVIE, memberId: MEMBER, expiresAt: new Date(Date.now() - DAY_MS) })]
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: true, data: { keepId: "keep-2" } })
    expect(store.protections[0]).toMatchObject({ status: "ended", endedBy: "expired", activeKey: null })
  })

  it("returns the first Keep when a second Keep of the same title meets the unique index", async () => {
    const winner = buildCleanupProtection({ id: "keep-winner", itemKey: MOVIE, memberId: MEMBER, expiresAt: new Date(Date.now() + DAY_MS) })
    store.beforeKeep = () => {
      store.beforeKeep = undefined
      // The winner's transaction commits while this one rolls back
      store.afterRollback = () => store.protections.push(winner)
      throw unique()
    }
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: true, data: { keepId: "keep-winner" } })
    expect(audits(AuditEventType.CLEANUP_KEEP_ADDED)).toEqual([])
  })

  it("fails without the error text when a unique error has no winner", async () => {
    store.beforeKeep = () => {
      throw unique()
    }
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toEqual({ success: false, code: "CONFLICT", error: "That already exists." })
  })
})

// ---- Cascade and the deleting check (E33) ----------------------------------------

describe("keepCleanupTitle cascade and deleting check", () => {
  it("takes out the show row when a member keeps a season, and keeps only the season row for Undo", async () => {
    setup([item(SEASON), item(SHOW), item(SEASON_2)])
    expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: true })
    expect(store.items.map((r) => r.itemKey)).toEqual([SEASON_2])
    expect(store.outcomes.map((o) => [o.itemKey, o.kind, o.reason])).toEqual([[SEASON, "rescued", "kept"], [SHOW, "rescued", "kept"]])
    expect(store.protections[0].restore).toMatchObject({ leaveOn: "2026-12-08" })
    expect(transactions).toBe(1)
  })

  it("takes out the season rows when a member keeps a show, and leaves held rows", async () => {
    setup([item(SHOW), item(SEASON), item(SEASON_2, { state: "held", leaveOn: null }), item("show:tmdb:2002"), item("movie:tvdb:2002")])
    expect(await keepCleanupTitle({ itemKey: SHOW })).toMatchObject({ success: true })
    expect(store.items.map((r) => r.itemKey).sort()).toEqual(["movie:tvdb:2002", SEASON_2, "show:tmdb:2002"].sort())
  })

  it.each([
    ["a season while its show row is deleting", SEASON, [item(SEASON), item(SHOW, { state: "deleting" })]],
    ["a show while a season row is deleting", SHOW, [item(SHOW), item(SEASON, { state: "deleting" }), item(SEASON_2)]],
  ])("refuses a Keep of %s and creates no Keep", async (_case, key, items) => {
    setup(items)
    const before = store.items.map((r) => ({ ...r }))
    expect(await keepCleanupTitle({ itemKey: key })).toEqual({ success: false, code: "CLEANUP_DELETING", error: DELETING_WORDS })
    expect(store.protections).toEqual([])
    expect(store.items).toEqual(before)
    expect(store.outcomes).toEqual([])
    expect(audits(AuditEventType.CLEANUP_KEEP_ADDED)).toEqual([])
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("rolls back when a held season row turns deleting inside the transaction", async () => {
    setup([item(SHOW), item(SEASON, { state: "held", leaveOn: null })])
    store.onTransaction = () => Object.assign(row(SEASON) as CleanupItem, { state: "deleting" })
    expect(await keepCleanupTitle({ itemKey: SHOW })).toMatchObject({ success: false, code: "CLEANUP_DELETING" })
    expect(store.protections).toEqual([])
  })

  it("runs once more with fresh rows after an exit that matched zero rows", async () => {
    setup([item(SEASON), item(SHOW)])
    store.onTransaction = (n) => {
      if (n === 1) Object.assign(row(SHOW) as CleanupItem, { updatedAt: tick() })
    }
    expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: true, data: { keepId: "keep-1" } })
    expect(transactions).toBe(2)
    expect(store.items).toEqual([])
    expect(store.protections).toHaveLength(1)
  })

  it("gives CLEANUP_DELETING when the row read again is deleting", async () => {
    setup([item(SEASON), item(SHOW)])
    store.onTransaction = () => Object.assign(row(SHOW) as CleanupItem, { state: "deleting", updatedAt: tick() })
    expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: false, code: "CLEANUP_DELETING" })
    expect(transactions).toBe(1)
    expect(store.protections).toEqual([])
    expect(row(SEASON)).toBeDefined()
  })

  it("gives CLEANUP_DELETING after a second exit that matched zero rows", async () => {
    setup([item(SEASON), item(SHOW)])
    store.onTransaction = () => Object.assign(row(SHOW) as CleanupItem, { updatedAt: tick() })
    expect(await keepCleanupTitle({ itemKey: SEASON })).toMatchObject({ success: false, code: "CLEANUP_DELETING" })
    expect(transactions).toBe(2)
    expect(store.protections).toEqual([])
  })

  it("gives CLEANUP_NOT_LEAVING when the kept row left Leaving soon meanwhile", async () => {
    setup([item(MOVIE)])
    store.onTransaction = () => {
      store.items = []
    }
    expect(await keepCleanupTitle({ itemKey: MOVIE })).toMatchObject({ success: false, code: "CLEANUP_NOT_LEAVING" })
    expect(store.protections).toEqual([])
  })
})

// ---- End keep and Undo -----------------------------------------------------------

describe("removeMyCleanupKeep", () => {
  const KEPT_AT = new Date(Date.now() - 60_000)
  /** The day `n` days after the Keep's day (the zone is UTC). */
  const dayAfter = (n: number) => addDays(dayKey(KEPT_AT.getTime(), "UTC"), n)

  /** The member's active Keep of `key` with the restore of the row that it took out. */
  function kept(key: string, restore: Record<string, unknown> | null = {}) {
    const level = key.split(":")[0]
    const titleKey = key.split(":").slice(1, 3).join(":")
    const keep = buildCleanupProtection({
      id: "keep-1", itemKey: key, level, titleKey, seasonNumber: level === "season" ? 1 : null, memberId: MEMBER, expiresAt: new Date(Date.now() + DAY_MS),
      restore: restore && buildRestoreItem({ ruleIds: ["rule-1"], leaveOn: "2026-12-08", firstLeaveOn: "2026-12-01", keptAt: KEPT_AT.toISOString(), ...restore }),
    })
    store.protections.push(keep)
    store.outcomes.push({ ...buildCleanupOutcome({ itemKey: key, kind: "rescued", reason: "kept" }), why: { kept: "why" } })
    return keep
  }

  beforeEach(() => setup([]))

  it("refuses a Keep of another member, and one that ended", async () => {
    kept(MOVIE)
    store.protections[0] = { ...store.protections[0], memberId: "member-2" }
    expect(await removeMyCleanupKeep({ keepId: "keep-1" })).toEqual({ success: false, code: "NOT_FOUND", error: "This Keep has already ended." })
    store.protections[0] = { ...store.protections[0], memberId: MEMBER, status: "ended" }
    expect(await removeMyCleanupKeep({ keepId: "keep-1" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(mockLog).not.toHaveBeenCalled()
  })

  it("ends the Keep and brings nothing back without restore", async () => {
    kept(MOVIE)
    expect(await removeMyCleanupKeep({ keepId: "keep-1" })).toEqual({ success: true, data: { restored: false } })
    expect(store.protections[0]).toMatchObject({ status: "ended", endedBy: "self", endedByUserId: MEMBER, activeKey: null })
    expect(store.items).toEqual([])
    expect(audits(AuditEventType.CLEANUP_KEEP_ENDED)).toEqual([
      { actor: MEMBER, targetUserId: MEMBER, keepId: "keep-1", itemKey: MOVIE, endedBy: "self", restored: false },
    ])
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("brings the row back with its old leave date, approval and Why on Undo", async () => {
    kept(MOVIE, { state: "approved", approvedAt: "2026-11-01T00:00:00.000Z", approvedBy: "admin-1", needsApproval: true })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: true } })
    expect(row(MOVIE)).toMatchObject({ state: "approved", leaveOn: "2026-12-08", firstLeaveOn: "2026-12-01", approvedBy: "admin-1", needsApproval: true,
      ruleIds: ["rule-1"], title: "The Invented Movie", arr: { service: "radarr", id: 11, titleSlug: "the-invented-movie-1001" }, why: { kept: "why" } })
    expect(store.protections[0]).toMatchObject({ status: "ended", endedBy: "self" })
    expect(audits(AuditEventType.CLEANUP_KEEP_ENDED)).toEqual([expect.objectContaining({ endedBy: "self", restored: true })])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
  })

  it("brings the row back as leaving with the approval cleared while cleanup is paused", async () => {
    store.settings = { ...store.settings, pausedAt: new Date() }
    kept(MOVIE, { state: "approved", approvedAt: "2026-11-01T00:00:00.000Z", approvedBy: "admin-1" })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: true } })
    expect(row(MOVIE)).toMatchObject({ state: "leaving", approvedAt: null, approvedBy: null })
  })

  it.each([
    ["a Resume", {}],
    ["a Feature on", { enabledAt: new Date() }],
  ])("brings the row back as leaving at the hold when %s came after the Keep (the pause cleared the approval)", async (_case, settings) => {
    const holdUntil = dayAfter(7)
    store.settings = { ...store.settings, ...settings, holdUntil }
    kept(MOVIE, { state: "approved", approvedAt: "2026-11-01T00:00:00.000Z", approvedBy: "admin-1", needsApproval: true, leaveOn: dayAfter(2) })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: true } })
    expect(row(MOVIE)).toMatchObject({ state: "leaving", approvedAt: null, approvedBy: null, leaveOn: holdUntil, needsApproval: true })
  })

  it("keeps the approval and the leave date when the newest Resume came before the Keep's day", async () => {
    store.settings = { ...store.settings, holdUntil: dayAfter(6) }
    kept(MOVIE, { state: "approved", approvedAt: "2026-11-01T00:00:00.000Z", approvedBy: "admin-1", leaveOn: dayAfter(30) })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: true } })
    expect(row(MOVIE)).toMatchObject({ state: "approved", approvedBy: "admin-1", leaveOn: dayAfter(30) })
  })

  it.each([
    ["a live run started after the Keep", () => store.runs.push({ kind: "run", startedAt: new Date() })],
    ["an act step started after the Keep", () => store.runs.push({ kind: "act", startedAt: new Date() })],
    ["the feature is off", () => (store.settings = { ...store.settings, enabled: false })],
    ["a run made the row again", () => store.items.push(item(MOVIE))],
    ["a rule moved back to Dry run", () => (store.rules = [{ id: "rule-1", mode: "dryRun" }])],
    ["the library data lost the title", () => snapshot([])],
    ["the title has no arr record", () => snapshot([buildMovieItem({ arr: null })])],
  ])("acts as End keep when %s", async (_case, arrange) => {
    kept(MOVIE)
    arrange()
    const rows = store.items.length
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: false } })
    expect(store.items).toHaveLength(rows)
    expect(store.protections[0]).toMatchObject({ status: "ended", endedBy: "self" })
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("keeps the Undo when only a dry run started after the Keep", async () => {
    kept(MOVIE)
    store.runs.push({ kind: "dryRun", startedAt: new Date() }, { kind: "run", startedAt: new Date(KEPT_AT.getTime() - 1000) })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: true } })
  })

  it("acts as End keep for a Keep with no stored restore", async () => {
    kept(MOVIE, null)
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: false } })
    expect(store.items).toEqual([])
  })

  it("acts as End keep when a run creates the row between the check and the write", async () => {
    kept(MOVIE)
    store.beforeCreate = () => {
      throw unique()
    }
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: true, data: { restored: false } })
    expect(store.protections[0]).toMatchObject({ status: "ended", endedBy: "self" })
  })

  it("raises the show row when a season comes back (E21)", async () => {
    setup([item(SHOW, { leaveOn: "2026-12-01" })])
    kept(SEASON)
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toMatchObject({ success: true, data: { restored: true } })
    expect(row(SEASON)).toMatchObject({ leaveOn: "2026-12-08", level: "season", seasonNumber: 1, titleKey: "tvdb:2002", episodeCount: 1 })
    expect(row(SHOW)?.leaveOn).toBe("2026-12-08")
  })

  it("starts a show that comes back at its show floor", async () => {
    setup([item(SEASON, { leaveOn: "2026-12-20" })])
    kept(SHOW)
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toMatchObject({ success: true, data: { restored: true } })
    expect(row(SHOW)).toMatchObject({ leaveOn: "2026-12-20", firstLeaveOn: "2026-12-01", seasonCount: 3 })
  })

  it.each([false, true])("refuses with NOT_FOUND when the Keep ends meanwhile (restore %s)", async (restore) => {
    kept(MOVIE)
    prismaMock.cleanupProtection.updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(store.items).toEqual([])
    expect(mockLog).not.toHaveBeenCalled()
  })

  it("refuses with NOT_FOUND when the Keep ends meanwhile and its Undo fell back", async () => {
    kept(MOVIE)
    store.beforeCreate = () => {
      throw unique()
    }
    prismaMock.cleanupProtection.updateMany.mockImplementationOnce((async () => ({ count: 1 })) as never).mockResolvedValueOnce({ count: 0 })
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toMatchObject({ success: false, code: "NOT_FOUND" })
  })

  it("passes on an error that is not a unique error", async () => {
    kept(MOVIE)
    store.beforeCreate = () => {
      throw new Error("db down")
    }
    expect(await removeMyCleanupKeep({ keepId: "keep-1", restore: true })).toEqual({ success: false, code: "INTERNAL", error: "Could not end the Keep. Try again." })
  })
})
