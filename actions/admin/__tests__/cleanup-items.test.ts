/**
 * @jest-environment node
 */

/**
 * The item actions of media cleanup (TS 10.2, 10.3, E28, E33, E35, E36,
 * E37): refused callers, validation, each error code, the approval count
 * test and typed approval, the entry approval, the selection read, the item
 * and batch forms of Postpone and Exclude, the season raise of a Postpone,
 * the conflict stops, audits and enqueues.
 *
 * The database is a small in-memory table behind the shared Prisma mock. A
 * transaction runs on the same table and puts it back when its body throws,
 * as PostgreSQL rolls back, so "nothing is approved" is a fact of the table.
 * Hooks change rows between the reads and the writes of an action, as a
 * second writer does.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { approveCleanupEntryBatch, deleteCleanupBatch, excludeCleanupItems, getCleanupBatchSelection, postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { buildCleanupItem, buildCleanupProtection, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildDefinition, buildMovieItem } from "@/lib/cleanup/__tests__/helpers/builders"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { keysHash } from "@/lib/cleanup/keys-hash"
import { batchHash } from "@/lib/cleanup/run/batches"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import { type CleanupItem, type CleanupProtection, type CleanupSettings, Prisma } from "@/lib/generated/prisma/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { AuditEventType } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"
import type { ActionId } from "@/lib/validations/cleanup-vocabulary"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
const mockLog = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: (...args: unknown[]) => mockLog(...args),
  recordAuditEvent: jest.fn(),
}))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))
jest.mock("@/lib/cleanup/run/run-claim", () => ({ takeRunClaim: jest.fn(), releaseRunClaim: jest.fn(), loadReconcileContext: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadSnapshotLevel: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
const RULE = "rule-review"
const TODAY = dayKey(Date.now(), "UTC")
const YESTERDAY = addDays(TODAY, -1)
const GB = 1024n ** 3n

// ---- The in-memory table ------------------------------------------------------

type Where = Record<string, unknown>
interface Store {
  items: CleanupItem[]
  protections: CleanupProtection[]
  outcomes: Record<string, unknown>[]
  settings: CleanupSettings
  rules: { id: string; mode: string; createdAt: Date }[]
  /** At the start of each transaction (the count of transactions so far). */
  onTransaction?: (n: number) => void
  /** Before each `cleanupItem.updateMany` (the count of calls so far). Throw to fail the write. */
  beforeUpdate?: (where: Where, n: number) => void
  /** Before each `cleanupItem.findUnique`. */
  beforeFind?: (where: Where) => void
  /** Before each `cleanupItem.deleteMany` (the count of calls so far). */
  beforeDelete?: (n: number) => void
}

let store: Store
let clock = 0
let counts = { transaction: 0, update: 0, find: 0, delete: 0 }
const tick = () => new Date(Date.UTC(2026, 0, 1) + ++clock)

function test(value: unknown, cond: unknown): boolean {
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime()
  if (cond === null || typeof cond !== "object") return value === cond
  const c = cond as { in?: unknown[]; lte?: string; lt?: string; has?: string }
  if (c.in) return c.in.includes(value)
  if (c.has !== undefined) return Array.isArray(value) && value.includes(c.has)
  if (c.lte !== undefined) return typeof value === "string" && value <= c.lte
  return c.lt !== undefined && typeof value === "string" && value < c.lt
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
const saved = () => ({ items: store.items.map((r) => ({ ...r })), protections: store.protections.map((p) => ({ ...p })), outcomes: [...store.outcomes],
  settings: { ...store.settings } })

function wire() {
  const db = prismaMock
  db.config.findUnique.mockResolvedValue({ timezone: "UTC" } as never)
  db.cleanupSettings.findUnique.mockImplementation((async () => ({ ...store.settings })) as never)
  db.cleanupSettings.updateMany.mockImplementation((async ({ where }: { where: Where }) => ({ count: matches(store.settings, where) ? 1 : 0 })) as never)
  db.cleanupRule.findMany.mockImplementation((async () => store.rules) as never)
  db.cleanupOutcome.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } } as never)
  db.cleanupOutcome.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
    store.outcomes.push(data)
    return { id: `outcome-${store.outcomes.length}` }
  }) as never)
  db.cleanupItem.findMany.mockImplementation((async ({ where }: { where?: Where }) => store.items.filter((r) => matches(r, where)).map((r) => ({ ...r }))) as never)
  db.cleanupItem.findUnique.mockImplementation((async ({ where }: { where: Where }) => {
    counts.find += 1
    store.beforeFind?.(where)
    return copy(store.items.find((r) => matches(r, where)))
  }) as never)
  db.cleanupItem.count.mockImplementation((async ({ where }: { where: Where }) => store.items.filter((r) => matches(r, where)).length) as never)
  db.cleanupItem.updateMany.mockImplementation((async ({ where, data }: { where: Where; data: Partial<CleanupItem> }) => {
    counts.update += 1
    store.beforeUpdate?.(where, counts.update)
    const hit = store.items.filter((r) => matches(r, where))
    for (const row of hit) Object.assign(row, data, { updatedAt: tick() })
    return { count: hit.length }
  }) as never)
  db.cleanupItem.deleteMany.mockImplementation((async ({ where }: { where: Where }) => {
    counts.delete += 1
    store.beforeDelete?.(counts.delete)
    const before = store.items.length
    store.items = store.items.filter((r) => !matches(r, where))
    return { count: before - store.items.length }
  }) as never)
  db.cleanupProtection.findUnique.mockImplementation((async ({ where }: { where: { activeKey: string } }) =>
    copy(store.protections.find((p) => p.activeKey === where.activeKey))) as never)
  db.cleanupProtection.update.mockImplementation((async ({ where, data }: { where: { id: string }; data: Partial<CleanupProtection> }) => {
    const row = store.protections.find((p) => p.id === where.id)
    if (row) Object.assign(row, data)
    return row
  }) as never)
  db.cleanupProtection.create.mockImplementation((async ({ data }: { data: Partial<CleanupProtection> }) => {
    const row = buildCleanupProtection({ ...data, id: `exclusion-${store.protections.length + 1}` })
    store.protections.push(row)
    return row
  }) as never)
  db.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
    counts.transaction += 1
    store.onTransaction?.(counts.transaction)
    const before = saved()
    try {
      return await fn(prismaMock)
    } catch (error) {
      Object.assign(store, before)
      throw error
    }
  }) as never)
}

/** An item row by key. A season key `season:tvdb:9:2` gets its show's title key. */
function item(key: string, overrides: Partial<CleanupItem> = {}): CleanupItem {
  const [level, kind, id, season] = key.split(":")
  return buildCleanupItem({
    id: `id-${key}`, itemKey: key, level, titleKey: `${kind}:${id}`, seasonNumber: season ? Number(season) : null, title: `Invented ${key}`,
    state: "leaving", needsApproval: true, ruleIds: [RULE], leaveOn: YESTERDAY, sizeBytes: GB, updatedAt: tick(), ...overrides,
  })
}
const movies = (n: number, overrides: (i: number) => Partial<CleanupItem> = () => ({})) =>
  Array.from({ length: n }, (_, i) => item(`movie:tmdb:${1000 + i}`, { sizeBytes: BigInt(n - i) * GB, ...overrides(i) }))
const row = (key: string) => store.items.find((r) => r.itemKey === key)
const audits = (type: AuditEventType) => mockLog.mock.calls.filter(([t]) => t === type).map(([, , details]) => details as Record<string, unknown>)
const conflictError = () => new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "7" })

function setup(items: CleanupItem[], settings: Partial<CleanupSettings> = {}) {
  store = { items, protections: [], outcomes: [], settings: buildCleanupSettings({ enabled: true, ...settings }),
    rules: [{ id: RULE, mode: "reviewFirst", createdAt: new Date("2026-01-01T00:00:00Z") }] }
}

/** What the card sends for the batch: the hash of every row, and the summary of the selected rows (E36). */
function approval(rows: CleanupItem[], unticked: string[] = [], overrides: Record<string, unknown> = {}) {
  const selected = rows.filter((r) => !unticked.includes(r.itemKey))
  const action = selected.reduce<ActionId>((least, r) => (r.action.endsWith(".delete") ? (r.action as ActionId) : least), selected[0]?.action as ActionId)
  return {
    batchId: `deletion-${RULE}`, count: rows.length, keysHash: batchHash(rows), excludeKeys: unticked,
    selected: { count: selected.length, action, exclusionCount: selected.filter((r) => r.importListExclusion).length },
    reviewedAt: new Date().toISOString(), ...(selected.length > 50 ? { typedCount: selected.length } : {}), ...overrides,
  }
}
const batchForm = (rows: CleanupItem[], unticked: string[] = [], overrides: Record<string, unknown> = {}) => ({
  batchId: `deletion-${RULE}`, count: rows.length, keysHash: batchHash(rows), excludeKeys: unticked, selectedCount: rows.length - unticked.filter((k) => rows.some((r) => r.itemKey === k)).length,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  counts = { transaction: 0, update: 0, find: 0, delete: 0 }
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  jest.mocked(consume).mockResolvedValue({ ok: true, remaining: 10 } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "job-1" })
  jest.mocked(requestCollectionSync).mockResolvedValue({ flagged: true, queued: true })
  jest.mocked(loadSnapshotLevel).mockResolvedValue(null)
  setup([])
  wire()
})

// ---- Callers, limits and validation ----------------------------------------------

describe("refused callers, limits and validation", () => {
  const CALLS = [
    ["deleteCleanupBatch", () => deleteCleanupBatch(approval(movies(2)))],
    ["approveCleanupEntryBatch", () => approveCleanupEntryBatch({ batchId: `entry-${RULE}`, count: 1, keysHash: keysHash(["movie:tmdb:1"]), reviewedAt: new Date().toISOString() })],
    ["getCleanupBatchSelection", () => getCleanupBatchSelection({ batchId: `deletion-${RULE}`, keys: ["movie:tmdb:1"] })],
    ["postponeCleanupItems", () => postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], days: 7 })],
    ["excludeCleanupItems", () => excludeCleanupItems({ itemKeys: ["movie:tmdb:1"], until: null })],
  ] as const

  it.each(CALLS)("%s refuses a signed-out caller and a member before any read", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(call()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "member-1", isAdmin: false }, expires: "" })
    await expect(call()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
  })

  it("spends admin:cleanup for the writes and admin:cleanup-preview for the selection read", async () => {
    for (const [name, call] of CALLS) {
      jest.mocked(consume).mockClear()
      await call()
      expect([name, jest.mocked(consume).mock.calls[0]]).toEqual([name, [name === "getCleanupBatchSelection" ? "admin:cleanup-preview" : "admin:cleanup", "admin-1"]])
    }
    jest.mocked(consume).mockResolvedValueOnce({ ok: false, retryAfterSec: 60 } as never)
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], days: 7 })).resolves.toMatchObject({ code: "RATE_LIMITED" })
  })

  it.each([
    ["both targets", () => postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], batch: batchForm(movies(1)), days: 7 })],
    ["no target", () => excludeCleanupItems({ until: null })],
    ["an entry id in the batch form", () => postponeCleanupItems({ batch: { ...batchForm(movies(1)), batchId: `entry-${RULE}` }, days: 7 })],
    ["days above 3650", () => postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], days: 3651 })],
    ["a deletion approval of an entry batch", () => deleteCleanupBatch({ ...approval(movies(1)), batchId: `entry-${RULE}` })],
    ["an entry approval of a deletion batch", () => approveCleanupEntryBatch({ batchId: `deletion-${RULE}`, count: 1, keysHash: keysHash([]), reviewedAt: new Date().toISOString() })],
    ["a bad item key", () => excludeCleanupItems({ itemKeys: ["not a key"], until: null })],
  ])("refuses %s with VALIDATION and writes nothing", async (_name, call) => {
    await expect(call()).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

// ---- deleteCleanupBatch -----------------------------------------------------------

describe("deleteCleanupBatch", () => {
  const approved = () => store.items.filter((r) => r.state === "approved").map((r) => r.itemKey)

  it("approves the batch minus the unticked rows, audits, enqueues the act step and revalidates", async () => {
    const rows = movies(4, (i) => ({ importListExclusion: i === 0 }))
    setup(rows)
    const result = await deleteCleanupBatch(approval(rows, [rows[3].itemKey]))
    expect(result).toEqual({ success: true, data: { approved: 3, actQueued: true } })
    expect(approved()).toEqual(rows.slice(0, 3).map((r) => r.itemKey))
    expect(row(rows[0].itemKey)).toMatchObject({ approvedBy: "admin-1", approvedAt: expect.any(Date), failCode: null })
    expect(audits(AuditEventType.CLEANUP_BATCH_APPROVED)).toEqual([{ kind: "deletion", ruleId: RULE, count: 3, bytes: String(9n * GB), excluded: 1,
      keysHash: batchHash(rows), typed: false }])
    expect(enqueueFromRequest).toHaveBeenCalledWith("cleanup:act", { trigger: "approval", actorId: "admin-1" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("keeps the approval when the queue fails or Redis is not set up (actQueued: false)", async () => {
    const rows = movies(2)
    setup(rows)
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(deleteCleanupBatch(approval(rows))).resolves.toEqual({ success: true, data: { approved: 2, actQueued: false } })
    expect(approved()).toHaveLength(2)
    setup(movies(2))
    jest.mocked(isRedisConfigured).mockReturnValueOnce(false)
    await expect(deleteCleanupBatch(approval(store.items))).resolves.toMatchObject({ data: { actQueued: false } })
  })

  it("refuses while off or paused, before any write", async () => {
    setup(movies(2), { enabled: false })
    await expect(deleteCleanupBatch(approval(store.items))).resolves.toEqual({ success: false, code: "CLEANUP_OFF", error: "Media cleanup is off. Turn it on in Settings first." })
    setup(movies(2), { pausedAt: new Date() })
    await expect(deleteCleanupBatch(approval(store.items))).resolves.toMatchObject({ code: "CLEANUP_PAUSED", error: "Cleanup is paused. Resume it first." })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ["older than 15 minutes", new Date(Date.now() - 16 * 60_000).toISOString()],
    ["more than 60 s ahead", new Date(Date.now() + 2 * 60_000).toISOString()],
  ])("refuses a reviewedAt %s with CLEANUP_REVIEW_STALE", async (_label, reviewedAt) => {
    setup(movies(2))
    await expect(deleteCleanupBatch(approval(store.items, [], { reviewedAt }))).resolves.toEqual({ success: false, code: "CLEANUP_REVIEW_STALE",
      error: "The numbers changed. Check them again." })
    expect(approved()).toEqual([])
  })

  it("refuses a count or keysHash that does not match the batch, and a batch that is gone", async () => {
    const rows = movies(3)
    setup(rows)
    await expect(deleteCleanupBatch(approval(rows, [], { count: 4 }))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    await expect(deleteCleanupBatch(approval(rows, [], { keysHash: batchHash(rows.slice(1)) }))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    await expect(deleteCleanupBatch(approval(rows, [], { batchId: "deletion-other-rule" }))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(approved()).toEqual([])
  })

  it("is stale after a save that turned the exclusion on for one item between the load and the approval (E35)", async () => {
    const rows = movies(3)
    setup(rows)
    const sent = approval(rows)
    row(rows[1].itemKey)!.importListExclusion = true
    await expect(deleteCleanupBatch(sent)).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(approved()).toEqual([])
  })

  it("ignores an unticked key that left the batch, and approves (E36)", async () => {
    const rows = movies(2)
    setup(rows)
    await expect(deleteCleanupBatch(approval(rows, ["movie:tmdb:999"]))).resolves.toMatchObject({ data: { approved: 2 } })
    expect(audits(AuditEventType.CLEANUP_BATCH_APPROVED)[0]).toMatchObject({ excluded: 0 })
  })

  it.each([
    ["count", { count: 1, action: "movie.delete", exclusionCount: 0 }],
    ["least careful action", { count: 2, action: "movie.unmonitorDeleteFiles", exclusionCount: 0 }],
    ["exclusion count", { count: 2, action: "movie.delete", exclusionCount: 1 }],
  ])("refuses a selected %s that differs from the approved items, and approves nothing (E36)", async (_label, selected) => {
    const rows = movies(2)
    setup(rows)
    await expect(deleteCleanupBatch(approval(rows, [], { selected }))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(approved()).toEqual([])
  })

  it("refuses with nothing left to approve", async () => {
    const rows = movies(2)
    setup(rows)
    const sent = approval(rows, rows.map((r) => r.itemKey), { selected: { count: 1, action: "movie.delete", exclusionCount: 0 } })
    await expect(deleteCleanupBatch(sent)).resolves.toEqual({ success: false, code: "VALIDATION", error: "Select at least one title" })
  })

  it("needs the typed count above 50, and audits typed approvals", async () => {
    const rows = movies(51)
    setup(rows)
    await expect(deleteCleanupBatch(approval(rows, [], { typedCount: undefined }))).resolves.toEqual({ success: false, code: "VALIDATION", error: "Type 51 to confirm." })
    await expect(deleteCleanupBatch(approval(rows, [], { typedCount: 50 }))).resolves.toMatchObject({ code: "VALIDATION" })
    expect(approved()).toEqual([])
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ data: { approved: 51 } })
    expect(audits(AuditEventType.CLEANUP_BATCH_APPROVED)[0]).toMatchObject({ count: 51, typed: true })
  })

  it("rolls back with CLEANUP_PAUSED when a pause commits before the approval transaction (E20)", async () => {
    const rows = movies(2)
    setup(rows)
    store.onTransaction = () => {
      store.settings.pausedAt = new Date()
    }
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ code: "CLEANUP_PAUSED" })
    expect(approved()).toEqual([])
    store.settings.pausedAt = null
    store.onTransaction = () => {
      store.settings.enabled = false
    }
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ code: "CLEANUP_OFF" })
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it("approves in groups of 100 with one action pair each, and a short last group of 150 approves none of the first 100 (safety-r5-3)", async () => {
    const rows = movies(150)
    setup(rows)
    store.beforeUpdate = (_where, n) => {
      if (n === 2) row(rows[149].itemKey)!.leaveOn = addDays(TODAY, 7) // a postpone in the window
    }
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(counts.update).toBe(2)
    expect(approved()).toEqual([])
  })

  it("is stale when a reconcile changes one item's action between the hash check and the write (safety-r4-2)", async () => {
    const rows = movies(3)
    setup(rows)
    store.onTransaction = () => {
      row(rows[0].itemKey)!.action = "movie.unmonitorDeleteFiles"
    }
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(approved()).toEqual([])
  })

  it("writes one group per action pair: mixed items approve with the where of each pair", async () => {
    const rows = movies(3, (i) => ({ action: i === 2 ? "movie.unmonitorDeleteFiles" : "movie.delete", importListExclusion: i === 0 }))
    setup(rows)
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ data: { approved: 3 } })
    const wheres = prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args?.where as Where)
    expect(wheres.map((w) => [w.action, w.importListExclusion, (w.itemKey as { in: string[] }).in.length])).toEqual([
      ["movie.delete", true, 1], ["movie.delete", false, 1], ["movie.unmonitorDeleteFiles", false, 1],
    ])
    expect(wheres[0]).toMatchObject({ state: "leaving", needsApproval: true, leaveOn: { lte: TODAY } })
  })

  it("answers CLEANUP_REVIEW_STALE for a conflict error, such as a deadlock with a batch Postpone (architecture-r7-4)", async () => {
    const rows = movies(2)
    setup(rows)
    store.beforeUpdate = () => {
      throw conflictError()
    }
    await expect(deleteCleanupBatch(approval(rows))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(approved()).toEqual([])
    store.beforeUpdate = () => {
      throw new Error("database down")
    }
    await expect(deleteCleanupBatch(approval(rows))).resolves.toEqual({ success: false, code: "INTERNAL", error: "Could not approve the batch. Try again." })
  })
})

// ---- getCleanupBatchSelection --------------------------------------------------------

describe("getCleanupBatchSelection", () => {
  it("returns the batch counts and only the asked keys that are in the batch, with their values, and writes nothing", async () => {
    const rows = movies(3, (i) => ({ importListExclusion: i === 1, action: i === 2 ? "movie.unmonitorDeleteFiles" : "movie.delete" }))
    setup(rows, { pausedAt: new Date() })
    const result = await getCleanupBatchSelection({ batchId: `deletion-${RULE}`, keys: [rows[1].itemKey, "movie:tmdb:999"] })
    expect(result).toEqual({ success: true, data: {
      count: 3, bytes: String(6n * GB), keysHash: batchHash(rows), actionCounts: { "movie.delete": 2, "movie.unmonitorDeleteFiles": 1 }, exclusionCount: 1,
      unticked: [{ itemKey: rows[1].itemKey, action: "movie.delete", importListExclusion: true, sizeBytes: String(2n * GB) }],
    } })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("answers zero counts for a batch with no item", async () => {
    await expect(getCleanupBatchSelection({ batchId: `deletion-${RULE}`, keys: ["movie:tmdb:1"] })).resolves.toMatchObject({
      data: { count: 0, bytes: "0", unticked: [], keysHash: batchHash([]) } })
  })
})

// ---- approveCleanupEntryBatch --------------------------------------------------------

describe("approveCleanupEntryBatch", () => {
  const definition = buildDefinition({ level: "show", libraries: ["2"], then: { graceDays: 10, action: "show.delete", importListExclusion: false } })
  const liveRule = { id: RULE, mode: "reviewFirst", revision: 1, createdAt: new Date("2026-01-01T00:00:00Z"), definition, compiled: compileDefinition(definition), blocks: [] }
  const held = (key: string, overrides: Partial<CleanupItem> = {}) =>
    item(key, { state: "held", heldAt: new Date(), enteredAt: null, leaveOn: null, firstLeaveOn: null, needsApproval: true, action: "show.delete", ...overrides })
  const input = (rows: CleanupItem[], excludeKeys: string[] = []) => ({ batchId: `entry-${RULE}`, count: rows.length, keysHash: keysHash(rows.map((r) => r.itemKey)),
    excludeKeys, reviewedAt: new Date().toISOString() })

  beforeEach(() => {
    jest.mocked(takeRunClaim).mockResolvedValue({ claim: { column: "runClaimAt" }, baseline: { rules: [], optionsHash: "x" } } as never)
    jest.mocked(releaseRunClaim).mockResolvedValue({ rounds: 0 })
    jest.mocked(loadReconcileContext).mockImplementation((async () => ({ now: new Date(), today: TODAY, zone: "UTC", settings: { holdUntil: null },
      rules: new Map([[RULE, liveRule]]) })) as never)
  })

  it("puts the held rows in Leaving soon at the show floor, keeps unticked rows held, releases, audits and syncs (safety-r7-2)", async () => {
    const shows = [held("show:tvdb:1"), held("show:tvdb:2"), held("show:tvdb:3")]
    const season = item("season:tvdb:1:4", { leaveOn: addDays(TODAY, 40), state: "leaving", needsApproval: false, ruleIds: ["rule-season"] })
    setup([...shows, season])
    const result = await approveCleanupEntryBatch(input(shows, ["show:tvdb:3", "show:tvdb:999"]))
    expect(result).toEqual({ success: true, data: { joined: 2 } })
    expect(row("show:tvdb:1")).toMatchObject({ state: "leaving", leaveOn: addDays(TODAY, 40), heldAt: null, enteredAt: expect.any(Date) })
    expect(row("show:tvdb:2")).toMatchObject({ state: "leaving", leaveOn: addDays(TODAY, 10) })
    expect(row("show:tvdb:3")).toMatchObject({ state: "held", leaveOn: null })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    expect(audits(AuditEventType.CLEANUP_BATCH_APPROVED)).toEqual([expect.objectContaining({ kind: "entry", ruleId: RULE, count: 2, excluded: 1, typed: false })])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
  })

  it("answers CONFLICT while a run holds the claim, and refuses off, paused and stale reviews", async () => {
    const shows = [held("show:tvdb:1")]
    setup(shows)
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(approveCleanupEntryBatch(input(shows))).resolves.toEqual({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    setup(shows, { pausedAt: new Date() })
    await expect(approveCleanupEntryBatch(input(shows))).resolves.toMatchObject({ code: "CLEANUP_PAUSED" })
    setup(shows)
    await expect(approveCleanupEntryBatch({ ...input(shows), reviewedAt: new Date(0).toISOString() })).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(releaseRunClaim).not.toHaveBeenCalled()
  })

  it("is stale under the claim for another count or hash, or a rule back in Dry run, and releases the claim each time", async () => {
    const shows = [held("show:tvdb:1"), held("show:tvdb:2")]
    setup(shows)
    await expect(approveCleanupEntryBatch({ ...input(shows), count: 3 })).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    await expect(approveCleanupEntryBatch(input(shows, shows.map((r) => r.itemKey)))).resolves.toMatchObject({ code: "VALIDATION" })
    jest.mocked(loadReconcileContext).mockResolvedValueOnce({ rules: new Map() } as never)
    await expect(approveCleanupEntryBatch(input(shows))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    setup([])
    await expect(approveCleanupEntryBatch(input(shows))).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(releaseRunClaim).toHaveBeenCalledTimes(4)
    expect(store.items.every((r) => r.state === "held")).toBe(true)
    expect(audits(AuditEventType.CLEANUP_BATCH_APPROVED)).toEqual([])
  })
})

// ---- postponeCleanupItems: item form ----------------------------------------------------

describe("postponeCleanupItems, item form", () => {
  it("moves leave dates later from max(leaveOn, today), clears approvals, audits and syncs", async () => {
    const later = addDays(TODAY, 20)
    setup([item("movie:tmdb:1"), item("movie:tmdb:2", { leaveOn: later, state: "approved", approvedAt: new Date(), approvedBy: "admin-2", failCode: "x", holdCode: "y" })])
    const result = await postponeCleanupItems({ itemKeys: ["movie:tmdb:1", "movie:tmdb:2", "movie:tmdb:404"], days: 7 })
    expect(result).toEqual({ success: true, data: { postponed: 2, skipped: 0, firstLeaveOn: addDays(TODAY, 7), lastLeaveOn: addDays(later, 7) } })
    expect(row("movie:tmdb:2")).toMatchObject({ leaveOn: addDays(later, 7), state: "leaving", approvedAt: null, approvedBy: null, failCode: null, holdCode: null,
      postponedBy: "admin-1", postponedAt: expect.any(Date) })
    expect(audits(AuditEventType.CLEANUP_ITEMS_POSTPONED)).toEqual([{ count: 2, itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], more: 0, days: 7, skipped: 0 }])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("never moves a date earlier, and leaves held rows and missing keys out of the counts", async () => {
    setup([item("movie:tmdb:1", { leaveOn: addDays(TODAY, 100) }), item("movie:tmdb:2", { state: "held", leaveOn: null })])
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], days: 1 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
    expect(row("movie:tmdb:1")!.leaveOn).toBe(addDays(TODAY, 101))
    expect(row("movie:tmdb:2")!.leaveOn).toBeNull()
    jest.mocked(requestCollectionSync).mockClear()
    mockLog.mockClear()
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:404"], days: 1 })).resolves.toEqual({ success: true,
      data: { postponed: 0, skipped: 0, firstLeaveOn: null, lastLeaveOn: null } })
    expect(requestCollectionSync).not.toHaveBeenCalled()
    expect(mockLog).not.toHaveBeenCalled()
  })

  it("skips a key in deleting, and one such key alone answers CLEANUP_DELETING", async () => {
    setup([item("movie:tmdb:1", { state: "deleting" }), item("movie:tmdb:2")])
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], days: 7 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 1 } })
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], days: 7 })).resolves.toEqual({ success: false, code: "CLEANUP_DELETING",
      error: "This title, or part of it, is being deleted now. Try again in a few minutes." })
    expect(row("movie:tmdb:1")!.leaveOn).toBe(YESTERDAY)
  })

  it("reads a row again after one change in the window, and stops with CONFLICT after a second", async () => {
    setup([item("movie:tmdb:1")])
    store.beforeUpdate = (_where, n) => {
      if (n === 1) row("movie:tmdb:1")!.updatedAt = tick()
    }
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], days: 7 })).resolves.toMatchObject({ data: { postponed: 1 } })
    store.beforeUpdate = () => {
      row("movie:tmdb:1")!.updatedAt = tick()
    }
    await expect(postponeCleanupItems({ itemKeys: ["movie:tmdb:1"], days: 7 })).resolves.toEqual({ success: false, code: "CONFLICT",
      error: "Someone else changed these titles at the same time. Try again." })
  })

  describe("a season and its show (E21, TS 10.3 cases 1 to 6)", () => {
    const SEASON = "season:tvdb:9:2"
    const SHOW = "show:tvdb:9"

    it("raises a show in Leaving soon to the season's new date", async () => {
      setup([item(SEASON), item(SHOW, { leaveOn: addDays(TODAY, 3), needsApproval: false })])
      await expect(postponeCleanupItems({ itemKeys: [SEASON], days: 14 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
      expect(row(SEASON)!.leaveOn).toBe(addDays(TODAY, 14))
      expect(row(SHOW)!.leaveOn).toBe(addDays(TODAY, 14))
    })

    it("changes no row and counts the key in skipped while the show is deleting (safety-r5-5)", async () => {
      setup([item(SEASON), item(SHOW, { state: "deleting" }), item("movie:tmdb:1")])
      const before = { ...row(SEASON)! }
      await expect(postponeCleanupItems({ itemKeys: [SEASON, "movie:tmdb:1"], days: 7 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 1 } })
      expect(row(SEASON)).toEqual(before)
      await expect(postponeCleanupItems({ itemKeys: [SEASON], days: 7 })).resolves.toMatchObject({ code: "CLEANUP_DELETING" })
    })

    it.each([
      ["held", [item(SHOW, { state: "held", leaveOn: null })]],
      ["gone", []],
    ])("moves the season and leaves the show row unchanged while the show is %s (safety-r6-1)", async (_label, showRows) => {
      setup([item(SEASON), ...showRows])
      const show = row(SHOW) && { ...row(SHOW)! }
      await expect(postponeCleanupItems({ itemKeys: [SEASON], days: 30 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
      expect(row(SEASON)!.leaveOn).toBe(addDays(TODAY, 30))
      expect(row(SHOW) && { ...row(SHOW)! }).toEqual(show)
    })

    it("keeps the postpone with no raise when the show date is already later (architecture-r7-1)", async () => {
      setup([item(SEASON), item(SHOW, { leaveOn: addDays(TODAY, 60), state: "approved" })])
      const show = { ...row(SHOW)! }
      await expect(postponeCleanupItems({ itemKeys: [SEASON], days: 7 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
      expect(row(SHOW)).toEqual(show)
    })

    it("raises once more a show that turned leaving with an earlier date after the first raise (safety-r7-1)", async () => {
      setup([item(SEASON), item(SHOW, { state: "held", leaveOn: null })])
      store.beforeFind = (where) => {
        if (where.itemKey === SHOW) Object.assign(row(SHOW)!, { state: "leaving", leaveOn: addDays(TODAY, 2) })
      }
      await expect(postponeCleanupItems({ itemKeys: [SEASON], days: 7 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
      expect(row(SHOW)!.leaveOn).toBe(addDays(TODAY, 7))
    })

    it("rolls the key back when the show changed again after the second raise", async () => {
      setup([item(SEASON), item(SHOW, { state: "held", leaveOn: null })])
      store.beforeFind = (where) => {
        if (where.itemKey !== SHOW) return
        // The first read finds an earlier date, and the second raise then meets a show that went to deleting
        Object.assign(row(SHOW)!, counts.find <= 2 ? { state: "leaving", leaveOn: addDays(TODAY, 2) } : { state: "deleting" })
      }
      store.beforeUpdate = (where) => {
        if (where.itemKey === SHOW && counts.find > 1) row(SHOW)!.state = "deleting"
      }
      await expect(postponeCleanupItems({ itemKeys: [SEASON], days: 7 })).resolves.toMatchObject({ code: "CLEANUP_DELETING" })
      expect(row(SEASON)!.leaveOn).toBe(YESTERDAY)
    })
  })
})

// ---- postponeCleanupItems: batch form ---------------------------------------------------

describe("postponeCleanupItems, batch form (E37, architecture-r6-3)", () => {
  it("postpones a batch of 60 minus one unticked row on page 2, with one new date, and audits the batch", async () => {
    const rows = movies(60)
    setup(rows)
    const unticked = rows[55].itemKey
    const result = await postponeCleanupItems({ batch: batchForm(rows, [unticked, "movie:tmdb:999"]), days: 14 })
    expect(result).toEqual({ success: true, data: { postponed: 59, skipped: 0, firstLeaveOn: addDays(TODAY, 14), lastLeaveOn: addDays(TODAY, 14) } })
    expect(row(unticked)!.leaveOn).toBe(YESTERDAY)
    expect(audits(AuditEventType.CLEANUP_ITEMS_POSTPONED)).toEqual([expect.objectContaining({ count: 59, batchId: `deletion-${RULE}`, excluded: 1, days: 14, skipped: 0 })])
  })

  it.each([
    ["a changed keysHash", (rows: CleanupItem[]) => batchForm(rows, [], { keysHash: batchHash(rows.slice(1)) })],
    ["another count", (rows: CleanupItem[]) => batchForm(rows, [], { count: 5 })],
    ["another selectedCount", (rows: CleanupItem[]) => batchForm(rows, [rows[0].itemKey], { selectedCount: 4 })],
    ["a batch that is gone", (rows: CleanupItem[]) => batchForm(rows, [], { batchId: "deletion-gone" })],
  ])("changes nothing for %s (CLEANUP_REVIEW_STALE)", async (_label, form) => {
    const rows = movies(4)
    setup(rows)
    await expect(postponeCleanupItems({ batch: form(rows), days: 7 })).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(store.items.every((r) => r.leaveOn === YESTERDAY)).toBe(true)
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
  })

  it("refuses a batch form with every row unticked", async () => {
    const rows = movies(2)
    setup(rows)
    await expect(postponeCleanupItems({ batch: batchForm(rows, [], { excludeKeys: rows.map((r) => r.itemKey), selectedCount: 1 }), days: 7 }))
      .resolves.toMatchObject({ code: "VALIDATION", error: "Select at least one title" })
  })

  it("writes 150 movies in two groups; a key moved meanwhile keeps its later date, an approved key loses its approval, a deleting key is skipped", async () => {
    const rows = movies(150)
    setup(rows)
    const later = addDays(TODAY, 40)
    store.beforeUpdate = (_where, n) => {
      if (n !== 1) return
      Object.assign(row(rows[0].itemKey)!, { leaveOn: later })
      Object.assign(row(rows[1].itemKey)!, { state: "approved", approvedAt: new Date(), approvedBy: "admin-2" })
      Object.assign(row(rows[2].itemKey)!, { state: "deleting" })
    }
    const result = await postponeCleanupItems({ batch: batchForm(rows), days: 7 })
    expect(result).toMatchObject({ success: true, data: { postponed: 148, skipped: 1 } })
    expect(counts.update).toBe(2)
    expect(prismaMock.cleanupItem.updateMany.mock.calls[0][0]?.where).toMatchObject({ state: { in: ["leaving", "approved"] }, leaveOn: { lte: TODAY } })
    expect(row(rows[0].itemKey)!.leaveOn).toBe(later)
    expect(row(rows[1].itemKey)).toMatchObject({ state: "leaving", approvedAt: null, approvedBy: null, leaveOn: addDays(TODAY, 7) })
    expect(row(rows[2].itemKey)).toMatchObject({ state: "deleting", leaveOn: YESTERDAY })
    expect(audits(AuditEventType.CLEANUP_ITEMS_POSTPONED)[0]).toMatchObject({ count: 148, skipped: 1, excluded: 0 })
  })

  it("stops with CONFLICT on a conflict in the second group, and still audits, syncs and revalidates the first 100 (safety-r8-1)", async () => {
    const rows = movies(150)
    setup(rows)
    store.beforeUpdate = (_where, n) => {
      if (n === 2) throw conflictError()
    }
    await expect(postponeCleanupItems({ batch: batchForm(rows), days: 7 })).resolves.toEqual({ success: false, code: "CONFLICT",
      error: "Someone else changed these titles at the same time. Try again." })
    expect(audits(AuditEventType.CLEANUP_ITEMS_POSTPONED)).toEqual([expect.objectContaining({ count: 100, itemKeys: rows.slice(0, 100).map((r) => r.itemKey) })])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("postpones season keys one by one from today, and leaves a season that another postpone moved", async () => {
    const seasons = [item("season:tvdb:9:1", { action: "season.unmonitorDeleteFiles" }), item("season:tvdb:9:2", { action: "season.unmonitorDeleteFiles" })]
    setup(seasons)
    store.onTransaction = (n) => {
      if (n === 2) row("season:tvdb:9:2")!.leaveOn = addDays(TODAY, 50)
    }
    await expect(postponeCleanupItems({ batch: batchForm(seasons), days: 7 })).resolves.toMatchObject({ data: { postponed: 1, skipped: 0 } })
    expect(row("season:tvdb:9:1")!.leaveOn).toBe(addDays(TODAY, 7))
    expect(row("season:tvdb:9:2")!.leaveOn).toBe(addDays(TODAY, 50))
  })

  it("stops with CONFLICT when a season transaction meets a conflict, and when a season changed twice", async () => {
    const seasons = [item("season:tvdb:9:1", { action: "season.unmonitorDeleteFiles" })]
    setup(seasons)
    store.onTransaction = () => {
      throw conflictError()
    }
    await expect(postponeCleanupItems({ batch: batchForm(seasons), days: 7 })).resolves.toMatchObject({ code: "CONFLICT" })
    store.onTransaction = undefined
    store.beforeUpdate = () => {
      row("season:tvdb:9:1")!.updatedAt = tick()
    }
    await expect(postponeCleanupItems({ batch: batchForm(seasons), days: 7 })).resolves.toMatchObject({ code: "CONFLICT" })
    store.beforeUpdate = () => {
      throw new Error("database down")
    }
    await expect(postponeCleanupItems({ batch: batchForm(seasons), days: 7 })).resolves.toMatchObject({ code: "INTERNAL" })
  })
})

// ---- excludeCleanupItems ------------------------------------------------------------------

describe("excludeCleanupItems", () => {
  const active = () => store.protections.filter((p) => p.activeKey !== null)

  it("ends an older exclusion, creates one to the end of the until day, takes the item out at once, audits and syncs", async () => {
    setup([item("movie:tmdb:1", { state: "approved" })])
    store.protections = [buildCleanupProtection({ id: "old", kind: "adminExclude", itemKey: "movie:tmdb:1", activeKey: "exclude:movie:tmdb:1", memberId: null, expiresAt: null })]
    const until = addDays(TODAY, 30)
    const result = await excludeCleanupItems({ itemKeys: ["movie:tmdb:1"], until, note: "  Rewatch later  " })
    expect(result).toEqual({ success: true, data: { excluded: 1, rescued: 1, skipped: 0 } })
    expect(store.protections.find((p) => p.id === "old")).toMatchObject({ status: "ended", activeKey: null, endedBy: "admin" })
    expect(active()).toEqual([expect.objectContaining({ kind: "adminExclude", itemKey: "movie:tmdb:1", note: "Rewatch later", createdBy: "admin-1",
      expiresAt: new Date(`${addDays(until, 1)}T00:00:00.000Z`), externalIds: { tmdb: 1 } })])
    expect(row("movie:tmdb:1")).toBeUndefined()
    expect(store.outcomes).toEqual([expect.objectContaining({ itemKey: "movie:tmdb:1", kind: "rescued", reason: "excluded" })])
    expect(audits(AuditEventType.CLEANUP_ITEMS_EXCLUDED)).toEqual([{ count: 1, itemKeys: ["movie:tmdb:1"], more: 0, until, hasNote: true, rescued: 1, skipped: 0 }])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
  })

  it("excludes a title from the library data with no end date, and syncs nothing when no row left", async () => {
    jest.mocked(loadSnapshotLevel).mockResolvedValue({ byKey: new Map([["movie:tmdb:1001", buildMovieItem({ ids: { tmdb: 1001, imdb: "tt1" } })]]) } as never)
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:1001", "movie:tmdb:404"], until: null })).resolves.toEqual({ success: true,
      data: { excluded: 1, rescued: 0, skipped: 0 } })
    expect(active()).toEqual([expect.objectContaining({ itemKey: "movie:tmdb:1001", expiresAt: null, note: null, externalIds: { tmdb: 1001, imdb: "tt1" } })])
    expect(requestCollectionSync).not.toHaveBeenCalled()
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:404"], until: null })).resolves.toEqual({ success: false, code: "NOT_FOUND",
      error: "This title is not in the library data." })
  })

  it("refuses an end date before today", async () => {
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:1"], until: YESTERDAY })).resolves.toMatchObject({ code: "VALIDATION" })
  })

  it("takes the season rows of an excluded show out, and the show row of an excluded season, in the same transaction (TS 5.4)", async () => {
    setup([item("show:tvdb:9"), item("season:tvdb:9:1"), item("season:tvdb:9:2", { state: "held", leaveOn: null }), item("movie:tvdb:9")])
    await expect(excludeCleanupItems({ itemKeys: ["show:tvdb:9"], until: null })).resolves.toMatchObject({ data: { excluded: 1, rescued: 2 } })
    expect(store.items.map((r) => r.itemKey)).toEqual(["movie:tvdb:9"])
    expect(store.outcomes.map((o) => [o.itemKey, o.kind])).toEqual([["show:tvdb:9", "rescued"], ["season:tvdb:9:1", "rescued"], ["season:tvdb:9:2", "released"]])
    expect(counts.transaction).toBe(1)
    setup([item("show:tvdb:8"), item("season:tvdb:8:3")])
    await expect(excludeCleanupItems({ itemKeys: ["season:tvdb:8:3"], until: null })).resolves.toMatchObject({ data: { rescued: 2 } })
    expect(store.items).toEqual([])
    expect(active()).toEqual([expect.objectContaining({ itemKey: "season:tvdb:8:3", level: "season", titleKey: "tvdb:8", externalIds: { tvdb: 8 } })])
  })

  it("creates no exclusion and counts the key in skipped while a row of the cascade is deleting (E33)", async () => {
    setup([item("show:tvdb:9"), item("season:tvdb:9:1", { state: "deleting" }), item("movie:tmdb:2")])
    await expect(excludeCleanupItems({ itemKeys: ["show:tvdb:9", "movie:tmdb:2"], until: null })).resolves.toEqual({ success: true,
      data: { excluded: 1, rescued: 1, skipped: 1 } })
    expect(row("show:tvdb:9")).toBeDefined()
    expect(active().map((p) => p.itemKey)).toEqual(["movie:tmdb:2"])
    await expect(excludeCleanupItems({ itemKeys: ["show:tvdb:9"], until: null })).resolves.toEqual({ success: false, code: "CLEANUP_DELETING",
      error: "This title, or part of it, is being deleted now. Try again in a few minutes." })
  })

  it("runs a key again after a zero-row exit, and skips it after a second", async () => {
    setup([item("movie:tmdb:1")])
    store.beforeDelete = (n) => {
      if (n === 1) row("movie:tmdb:1")!.updatedAt = tick()
    }
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:1"], until: null })).resolves.toMatchObject({ data: { excluded: 1 } })
    setup([item("movie:tmdb:1")])
    store.beforeDelete = () => {
      row("movie:tmdb:1")!.updatedAt = tick()
    }
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:1"], until: null })).resolves.toMatchObject({ code: "CLEANUP_DELETING" })
    expect(active()).toEqual([])
  })

  it("excludes the batch minus the unticked rows (E37), and is stale for another selectedCount", async () => {
    const rows = movies(60)
    setup(rows)
    await expect(excludeCleanupItems({ batch: batchForm(rows, [rows[3].itemKey], { selectedCount: 58 }), until: null })).resolves.toMatchObject({ code: "CLEANUP_REVIEW_STALE" })
    expect(active()).toEqual([])
    await expect(excludeCleanupItems({ batch: batchForm(rows, [rows[55].itemKey]), until: null })).resolves.toMatchObject({ data: { excluded: 59, rescued: 59 } })
    expect(store.items.map((r) => r.itemKey)).toEqual([rows[55].itemKey])
    expect(audits(AuditEventType.CLEANUP_ITEMS_EXCLUDED)[0]).toMatchObject({ count: 59, batchId: `deletion-${RULE}`, excluded: 1, hasNote: false })
  })

  it("stops with CONFLICT on a conflict, and audits the keys excluded before it", async () => {
    setup([item("movie:tmdb:1"), item("movie:tmdb:2"), item("movie:tmdb:3")])
    store.onTransaction = (n) => {
      if (n === 2) throw conflictError()
    }
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:1", "movie:tmdb:2", "movie:tmdb:3"], until: null })).resolves.toMatchObject({ code: "CONFLICT" })
    expect(audits(AuditEventType.CLEANUP_ITEMS_EXCLUDED)).toEqual([expect.objectContaining({ count: 1, itemKeys: ["movie:tmdb:1"] })])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
    store.onTransaction = () => {
      throw new Error("database down")
    }
    await expect(excludeCleanupItems({ itemKeys: ["movie:tmdb:2"], until: null })).resolves.toMatchObject({ code: "INTERNAL" })
  })
})
