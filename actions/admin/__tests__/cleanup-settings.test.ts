/**
 * @jest-environment node
 */

/**
 * The media cleanup settings actions (TS 10.2, 10.3, 8.12, 9.4, 9.5):
 * refused callers and the two limits, each settings section with its audit
 * row, the feature switch with the 7-day hold and the schedule, the exits of
 * a protections or members save (claimed and busy), the G13 read, the
 * Serializable retry of two saves at once and of a COMMIT conflict, pause
 * and resume with their no-ops, and the job starts in every Redis state.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import {
  pauseCleanup,
  refreshCleanupData,
  resumeCleanup,
  runCleanupNow,
  startCleanupFirstRead,
  updateCleanupSettings,
} from "@/actions/admin/cleanup-settings"
import { buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildEvalContext, buildLiveFacts, buildMovieItem, buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { settingsSavedToast } from "@/lib/cleanup/actions/settings/words"
import type { Claim } from "@/lib/cleanup/claims"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { evaluateGlobal, globalProtections } from "@/lib/cleanup/engine/protections"
import { reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { ensureCleanupSchedule } from "@/lib/cleanup/schedule"
import { loadPreviousCompleteHeader, type SnapshotHeader } from "@/lib/cleanup/snapshot/store"
import { Prisma } from "@/lib/generated/prisma/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest, isDeduplicatedJobPending } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { type CleanupOptions, parseCleanupOptions } from "@/lib/validations/cleanup-options"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn(), isDeduplicatedJobPending: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/store", () => ({ loadPreviousCompleteHeader: jest.fn() }))
jest.mock("@/lib/cleanup/run/run-claim", () => ({ takeRunClaim: jest.fn(), releaseRunClaim: jest.fn(), loadReconcileContext: jest.fn() }))
jest.mock("@/lib/cleanup/run/reconcile", () => ({ reconcile: jest.fn() }))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: jest.fn() }))
jest.mock("@/lib/cleanup/schedule", () => ({ ensureCleanupSchedule: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const HOLD = "2026-11-15"
const CLAIM: Claim = { column: "runClaimAt", lost: new AbortController().signal, value: () => new Date(NOW) }
const BASELINE = { rules: [], optionsHash: "0" }
const RUN_CONFLICT = "A run is in progress. Try again in a few minutes."
const SETTINGS_CONFLICT = "Someone else saved settings at the same time. Try again."
const REDIS = "Redis is not set up. Library reads and runs need the job queue."
const QUEUE = "The job queue is unavailable. Try again in a minute."
const SCHEDULE = "Settings saved, but the job queue did not answer. The nightly run starts after the next restart."
const HEADER: SnapshotHeader = {
  id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW), sources: [],
  facts: buildSnapshotFacts({ membersRead: ["christmas movies"] }),
}

/** The stored settings row. */
const stored = (overrides: Parameters<typeof buildCleanupSettings>[0] = {}) =>
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings(overrides))

const audits = (type: AuditEventType) => jest.mocked(logAuditEvent).mock.calls.filter(([t]) => t === type).map(([, , details]) => details)
/** The options of the last write. */
const written = (): CleanupOptions => parseCleanupOptions(prismaMock.cleanupSettings.upsert.mock.calls.at(-1)?.[0].update.options)
const conflictAtCommit = () => Object.assign(new Error("write conflict"), { name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict" } })
const conflictP2034 = () => new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" })

const DEFAULTS = parseCleanupOptions({})
const save = {
  budget: (items = 30) => updateCleanupSettings({ section: "cleanup-budget",
    values: { items, bytes: DEFAULTS.budget.bytes, entryCheck: { count: 50, percent: 15 }, automaticMinGraceDays: 7 } }),
  members: (keepsEnabled = false) => updateCleanupSettings({ section: "cleanup-members", values: { ...DEFAULTS.members, keepsEnabled } }),
  protections: (g13: string[] = [], tags = ["keep"]) => updateCleanupSettings({ section: "cleanup-protections",
    values: { protections: { ...DEFAULTS.protections, g4: { enabled: true, days: 60 }, g9: { enabled: true, tags }, g13: { enabled: g13.length > 0, collections: g13 } } } }),
}

function reconcileCtx(): ReconcileContext {
  return { now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: null, actorId: "admin-1",
    settings: { ...buildCleanupSettings(), options: DEFAULTS, runtime: { notices: [] } } as never, snapshot: null, evaluation: null, rules: new Map() }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(isDeduplicatedJobPending).mockResolvedValue({ ok: true, value: false })
  jest.mocked(enqueueFromRequest).mockImplementation(async (_type, _data, options) => ({ ok: true, jobId: String(options?.jobId ?? "policy-id") }))
  jest.mocked(loadPreviousCompleteHeader).mockResolvedValue(HEADER)
  jest.mocked(takeRunClaim).mockResolvedValue({ claim: CLAIM, baseline: BASELINE })
  jest.mocked(releaseRunClaim).mockResolvedValue({ rounds: 0 })
  jest.mocked(loadReconcileContext).mockResolvedValue(reconcileCtx())
  jest.mocked(reconcile).mockResolvedValue({ checked: 5, rescued: 1, released: 1, updated: 0, skipped: 0, rescuedByRule: {} })
  jest.mocked(requestCollectionSync).mockResolvedValue({ flagged: true, queued: true })
  jest.mocked(ensureCleanupSchedule).mockResolvedValue({ ok: true, state: "scheduled" })
  stored()
  prismaMock.cleanupSettings.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 2 })
  prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(null)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)) as never)
})

afterEach(() => jest.useRealTimers())

const CALLS = [
  ["updateCleanupSettings", "admin:cleanup", () => save.budget()],
  ["pauseCleanup", "admin:cleanup", () => pauseCleanup()],
  ["resumeCleanup", "admin:cleanup", () => resumeCleanup()],
  ["runCleanupNow", "admin", () => runCleanupNow()],
  ["refreshCleanupData", "admin", () => refreshCleanupData()],
  ["startCleanupFirstRead", "admin", () => startCleanupFirstRead()],
] as const

describe("every settings action", () => {
  it.each(CALLS)("%s refuses a signed-out caller and a member, and changes nothing", async (_name, _limit, call) => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(call()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "member-1", isAdmin: false }, expires: "" })
    await expect(call()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.cleanupSettings.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupSettings.upsert).not.toHaveBeenCalled()
    expect(enqueueFromRequest).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each(CALLS)("%s spends the per-admin %s limit", async (_name, limit, call) => {
    jest.mocked(consume).mockResolvedValueOnce({ ok: false, retryAfterSec: 30 })
    await expect(call()).resolves.toMatchObject({ success: false, code: "RATE_LIMITED", retryAfterSec: 30 })
    expect(consume).toHaveBeenCalledWith(limit, "admin-1")
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses an unknown section and a value out of range", async () => {
    await expect(updateCleanupSettings({ section: "cleanup-other" } as never)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    await expect(updateCleanupSettings({ section: "cleanup-budget", values: { items: 0, bytes: 1, entryCheck: { count: 1, percent: 1 }, automaticMinGraceDays: 7 } }))
      .resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe("updateCleanupSettings: the feature switch", () => {
  const turn = (enabled: boolean) => updateCleanupSettings({ section: "cleanup-feature", values: { enabled } })

  it("turns on under the run claim with the 7-day hold, recovers deleting items and moves earlier leave dates", async () => {
    await expect(turn(true)).resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(takeRunClaim).toHaveBeenCalledWith(new Date(NOW))
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledWith({
      where: { id: "cleanup", enabled: false }, data: { enabled: true, enabledAt: new Date(NOW), holdUntil: HOLD },
    })
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({ where: { state: "deleting" }, data: { state: "leaving", approvedAt: null, approvedBy: null } })
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({ where: { leaveOn: { lt: HOLD } }, data: { leaveOn: HOLD } })
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 })
    expect(releaseRunClaim).toHaveBeenCalledWith(CLAIM, BASELINE, { actorId: "admin-1" })
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toEqual([
      { section: "cleanup-feature", changedFields: ["enabled"], before: { enabled: false }, after: { enabled: true } },
    ])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
    expect(ensureCleanupSchedule).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("refuses to turn on while a run holds the claim, and changes nothing", async () => {
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(turn(true)).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(prismaMock.cleanupSettings.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(ensureCleanupSchedule).not.toHaveBeenCalled()
  })

  it("writes nothing when another save turned it on first, and still releases the claim", async () => {
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(turn(true)).resolves.toMatchObject({ success: true })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("releases the claim when the hold write throws", async () => {
    prismaMock.cleanupItem.updateMany.mockRejectedValueOnce(new Error("db down"))
    await expect(turn(true)).resolves.toMatchObject({ success: false, code: "INTERNAL" })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("turns off with no claim: the switch in its own statement, then only approved items go back to waiting", async () => {
    stored({ enabled: true })
    await expect(turn(false)).resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledWith({ where: { id: "cleanup", enabled: true }, data: { enabled: false } })
    expect(prismaMock.cleanupItem.updateMany.mock.calls).toEqual([
      [{ where: { state: "approved" }, data: { state: "leaving", approvedAt: null, approvedBy: null } }],
    ])
    expect(prismaMock.cleanupSettings.updateMany.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.cleanupItem.updateMany.mock.invocationCallOrder[0])
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toEqual([
      { section: "cleanup-feature", changedFields: ["enabled"], before: { enabled: true }, after: { enabled: false } },
    ])
    expect(requestCollectionSync).toHaveBeenCalledTimes(1)
    expect(ensureCleanupSchedule).toHaveBeenCalledTimes(1)
  })

  it("moves no item when another save turned it off first", async () => {
    stored({ enabled: true })
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(turn(false)).resolves.toMatchObject({ success: true })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each([true, false])("changes nothing when the switch is already %s, but still checks the schedule", async (enabled) => {
    stored({ enabled })
    await expect(turn(enabled)).resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(prismaMock.cleanupSettings.updateMany).not.toHaveBeenCalled()
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(ensureCleanupSchedule).toHaveBeenCalledTimes(1)
  })

  it.each([["TIMEOUT"], ["FAILED"]] as const)("keeps the save but answers UPSTREAM_UNAVAILABLE when the schedule fails (%s)", async (code) => {
    jest.mocked(ensureCleanupSchedule).mockResolvedValueOnce({ ok: false, code })
    await expect(turn(true)).resolves.toEqual({ success: false, code: "UPSTREAM_UNAVAILABLE", error: SCHEDULE })
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toHaveLength(1)
  })

  it("passes without Redis: the schedule has nothing to do", async () => {
    jest.mocked(ensureCleanupSchedule).mockResolvedValueOnce({ ok: true, state: "no-redis" })
    await expect(turn(true)).resolves.toEqual({ success: true, data: { exitsApplied: null } })
  })
})

describe("updateCleanupSettings: the options sections", () => {
  it("saves the budget section alone, keeps the other sections and audits the changed fields with closed values", async () => {
    stored({ options: { members: { keepDays: 120 } } })
    await expect(save.budget(30)).resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(written()).toMatchObject({ budget: { items: 30 }, entryCheck: { count: 50, percent: 15 }, members: { keepDays: 120 } })
    expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ updatedBy: "admin-1" }) }))
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toEqual([
      { section: "cleanup-budget", changedFields: ["items", "entryCheck.percent"], before: { items: 20, "entryCheck.percent": 10 },
        after: { items: 30, "entryCheck.percent": 15 } },
    ])
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("saves the defaults section with no exits and no collection sync", async () => {
    await expect(updateCleanupSettings({ section: "cleanup-defaults", values: { graceDays: 45, importListExclusion: false } }))
      .resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(written().defaults).toEqual({ graceDays: 45, importListExclusion: false })
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("asks for a Plex collection sync after a Plex save", async () => {
    await expect(updateCleanupSettings({ section: "cleanup-plex", values: { ...DEFAULTS.plex, recommended: true } }))
      .resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(written().plex.recommended).toBe(true)
    expect(requestCollectionSync).toHaveBeenCalledWith("cleanup-plex")
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toEqual([
      { section: "cleanup-plex", changedFields: ["recommended"], before: { recommended: false }, after: { recommended: true } },
    ])
  })

  it("writes no audit row and runs no exits when nothing changed", async () => {
    await expect(save.members(true)).resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("applies the exits of a protections save under the run claim, then asks for a collection sync", async () => {
    await expect(save.protections()).resolves.toEqual({ success: true, data: { exitsApplied: true } })
    expect(reconcile).toHaveBeenCalledWith({ ctx: reconcileCtx() })
    expect(loadReconcileContext).toHaveBeenCalledWith({ actorId: "admin-1" })
    expect(releaseRunClaim).toHaveBeenCalledWith(CLAIM, BASELINE, { actorId: "admin-1" })
    expect(requestCollectionSync).toHaveBeenCalledWith("cleanup-protections")
    expect(settingsSavedToast({ exitsApplied: true })).toBe("Settings saved")
  })

  it("asks for no collection sync when the exits took no title out", async () => {
    jest.mocked(reconcile).mockResolvedValueOnce({ checked: 5, rescued: 0, released: 0, updated: 1, skipped: 0, rescuedByRule: {} })
    await expect(save.protections()).resolves.toEqual({ success: true, data: { exitsApplied: true } })
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("skips the exits while a run holds the claim and says so (the busy toast)", async () => {
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    const result = await save.protections()
    expect(result).toEqual({ success: true, data: { exitsApplied: false } })
    expect(reconcile).not.toHaveBeenCalled()
    expect(releaseRunClaim).not.toHaveBeenCalled()
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toHaveLength(1)
    expect(settingsSavedToast({ exitsApplied: false })).toBe(
      "Settings saved. A run is in progress. At its end, titles that a new protection keeps safe leave Leaving soon."
    )
  })

  it("releases the claim when the exits throw", async () => {
    jest.mocked(reconcile).mockRejectedValueOnce(new Error("boom"))
    await expect(save.members()).resolves.toMatchObject({ success: false, code: "INTERNAL" })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
  })

  it("turns member Keeps off for new Keeps only: an active Keep still protects its title (E30)", async () => {
    stored({ enabled: true })
    await expect(save.members(false)).resolves.toEqual({ success: true, data: { exitsApplied: true } })
    const options = written()
    expect(options.members.keepsEnabled).toBe(false)
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toEqual([
      { section: "cleanup-members", changedFields: ["keepsEnabled"], before: { keepsEnabled: true }, after: { keepsEnabled: false } },
    ])
    const keep = { id: "k-1", itemKey: "movie:tmdb:1001", memberId: "u-1", expiresAt: new Date(NOW + 86_400_000) }
    const ctx = buildEvalContext({ options, globals: (level) => globalProtections(level, options), live: buildLiveFacts({ keeps: [keep] }) })
    expect(evaluateGlobal("g1", buildMovieItem(), ctx).verdict).toBe("protects")
    expect(prismaMock.cleanupProtection.updateMany).not.toHaveBeenCalled()
  })

  it("names free-text lists in changedFields but keeps their values out of the audit row", async () => {
    await save.protections(["Holiday Picks"], ["keep", "family"])
    const [details] = audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)
    expect(details).toEqual({
      section: "cleanup-protections",
      changedFields: ["g4.days", "g9.tags", "g13.enabled", "g13.collections"],
      before: { "g4.days": 30, "g13.enabled": false },
      after: { "g4.days": 60, "g13.enabled": true },
    })
    expect(JSON.stringify(details)).not.toMatch(/Holiday|family/)
  })

  it("starts a system read for a G13 name that no read has read yet", async () => {
    await save.protections(["Holiday Picks", " Christmas Movies "])
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.CLEANUP_READ, { trigger: "system", chain: false },
      { attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } })
  })

  it("starts no read when every G13 name was read, with no name, or without Redis", async () => {
    await save.protections(["Christmas Movies"])
    await save.protections([])
    jest.mocked(isRedisConfigured).mockReturnValue(false)
    await save.protections(["Holiday Picks"])
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it("starts a read before the first snapshot, and saves even when the queue does not answer", async () => {
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValueOnce(null)
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(save.protections(["Christmas Movies"])).resolves.toEqual({ success: true, data: { exitsApplied: true } })
    expect(enqueueFromRequest).toHaveBeenCalledTimes(1)
  })
})

describe("updateCleanupSettings: saves at the same time (inSerializable)", () => {
  beforeEach(() => jest.useRealTimers())

  it("keeps both changes when two sections save at once: the second commit conflicts and runs again on fresh reads", async () => {
    let options: unknown = {}
    let version = 0
    let begun = 0
    let bothRead!: () => void
    const gate = new Promise<void>((resolve) => (bothRead = resolve))
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
      const start = version
      let next: unknown = options
      const tx = {
        cleanupSettings: {
          findUnique: async () => {
            begun += 1
            if (begun === 2) bothRead()
            await gate
            return buildCleanupSettings({ options: options as Prisma.JsonValue })
          },
          upsert: async ({ update }: { update: { options: unknown } }) => {
            next = update.options
            return {}
          },
        },
      }
      const result = await fn(tx)
      if (version !== start) throw conflictAtCommit()
      options = next
      version += 1
      return result
    }) as never)

    const [budget, members] = await Promise.all([save.budget(40), save.members(false)])
    expect(budget).toMatchObject({ success: true })
    expect(members).toMatchObject({ success: true })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3)
    expect(parseCleanupOptions(options)).toMatchObject({ budget: { items: 40 }, members: { keepsEnabled: false } })
  })

  it("retries a conflict that PostgreSQL finds at COMMIT", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(conflictAtCommit())
    await expect(save.budget()).resolves.toEqual({ success: true, data: { exitsApplied: null } })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
    expect(audits(AuditEventType.CLEANUP_SETTINGS_CHANGED)).toHaveLength(1)
  })

  it("answers CONFLICT after the last retry, with nothing audited", async () => {
    prismaMock.$transaction.mockRejectedValue(conflictP2034())
    await expect(save.budget()).resolves.toEqual({ success: false, code: "CONFLICT", error: SETTINGS_CONFLICT })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(4)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(takeRunClaim).not.toHaveBeenCalled()
  })

  it("throws any other error at once", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("db down"))
    await expect(save.budget()).resolves.toMatchObject({ success: false, code: "INTERNAL" })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe("pauseCleanup", () => {
  it("pauses with no claim in its own statement, then moves every approved item back to waiting", async () => {
    stored({ enabled: true, runClaimAt: new Date(NOW - 60_000) }) // an act step holds the claim
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 3 })
    await expect(pauseCleanup()).resolves.toEqual({ success: true, data: { unapproved: 3 } })
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledWith({
      where: { id: "cleanup", pausedAt: null }, data: { pausedAt: new Date(NOW), pausedBy: "admin-1" },
    })
    expect(prismaMock.cleanupItem.updateMany.mock.calls).toEqual([
      [{ where: { state: "approved" }, data: { state: "leaving", approvedAt: null, approvedBy: null } }],
    ])
    expect(prismaMock.cleanupSettings.updateMany.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.cleanupItem.updateMany.mock.invocationCallOrder[0])
    expect(audits(AuditEventType.CLEANUP_PAUSED)).toEqual([{ unapproved: 3 }])
    expect(requestCollectionSync).toHaveBeenCalledWith("pause")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("creates the settings row on a first use before it pauses", async () => {
    prismaMock.cleanupSettings.findUnique.mockResolvedValueOnce(null)
    prismaMock.cleanupSettings.upsert.mockResolvedValueOnce(buildCleanupSettings())
    await expect(pauseCleanup()).resolves.toMatchObject({ success: true })
    expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith({ where: { id: "cleanup" }, create: { id: "cleanup" }, update: {} })
  })

  it("changes nothing and writes no audit row while paused", async () => {
    stored({ enabled: true, pausedAt: new Date(NOW - 3_600_000), pausedBy: "admin-2" })
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(pauseCleanup()).resolves.toEqual({ success: true, data: { unapproved: 0 } })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })
})

describe("resumeCleanup", () => {
  beforeEach(() => stored({ enabled: true, pausedAt: new Date(NOW - 3_600_000), pausedBy: "admin-1" }))

  it("resumes under the run claim with the 7-day hold, recovers deleting items as leaving and moves earlier leave dates", async () => {
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 4 })
    await expect(resumeCleanup()).resolves.toEqual({ success: true, data: { holdUntil: HOLD } })
    expect(takeRunClaim).toHaveBeenCalledWith(new Date(NOW))
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledWith({
      where: { id: "cleanup", pausedAt: { not: null } }, data: { pausedAt: null, pausedBy: null, holdUntil: HOLD },
    })
    expect(prismaMock.cleanupItem.updateMany.mock.calls).toEqual([
      [{ where: { state: "deleting" }, data: { state: "leaving", approvedAt: null, approvedBy: null } }],
      [{ where: { leaveOn: { lt: HOLD } }, data: { leaveOn: HOLD } }],
    ])
    expect(releaseRunClaim).toHaveBeenCalledWith(CLAIM, BASELINE, { actorId: "admin-1" })
    expect(audits(AuditEventType.CLEANUP_RESUMED)).toEqual([{ holdUntil: HOLD, moved: 4 }])
    expect(requestCollectionSync).toHaveBeenCalledWith("resume")
  })

  it("refuses while a run holds the claim, and changes nothing", async () => {
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(resumeCleanup()).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(prismaMock.cleanupSettings.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("changes nothing when not paused, and answers the hold in force", async () => {
    stored({ enabled: true, holdUntil: "2026-11-12" })
    await expect(resumeCleanup()).resolves.toEqual({ success: true, data: { holdUntil: "2026-11-12" } })
    stored({ enabled: true, holdUntil: "2026-11-01" })
    await expect(resumeCleanup()).resolves.toEqual({ success: true, data: { holdUntil: "2026-11-08" } })
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("writes nothing when another admin resumed first, and still releases the claim", async () => {
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(resumeCleanup()).resolves.toEqual({ success: true, data: { holdUntil: "2026-11-08" } })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe.each([
  ["runCleanupNow", runCleanupNow, "run", JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId: "admin-1", act: false }, "cleanup:run", "runClaimAt"],
  ["refreshCleanupData", refreshCleanupData, "read", JOB_TYPES.CLEANUP_READ, { trigger: "admin", actorId: "admin-1", chain: false }, "cleanup:read", "readClaimAt"],
] as const)("%s", (_name, action, kind, type, payload, deduplicationId, claimColumn) => {
  it("adds the job with its own id beside its deduplication id, audits and revalidates", async () => {
    await expect(action()).resolves.toEqual({ success: true, data: { queued: true } })
    expect(isDeduplicatedJobPending).toHaveBeenCalledWith(deduplicationId)
    expect(enqueueFromRequest).toHaveBeenCalledWith(type, payload, {
      attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 }, deduplication: { id: deduplicationId }, jobId: expect.any(String),
    })
    expect(audits(AuditEventType.CLEANUP_RUN_STARTED)).toEqual([{ kind, queued: true }])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("answers VALIDATION without Redis", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)
    await expect(action()).resolves.toEqual({ success: false, code: "VALIDATION", error: REDIS })
    expect(enqueueFromRequest).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses while its claim is held, but not after the claim went stale", async () => {
    stored({ [claimColumn]: new Date(NOW - 60_000) })
    await expect(action()).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(isDeduplicatedJobPending).not.toHaveBeenCalled()
    stored({ [claimColumn]: new Date(NOW - 31 * 60_000) })
    await expect(action()).resolves.toMatchObject({ success: true })
  })

  it("refuses while its job waits or runs", async () => {
    jest.mocked(isDeduplicatedJobPending).mockResolvedValueOnce({ ok: true, value: true })
    await expect(action()).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it("refuses an add that joined a job added a moment earlier", async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: true, jobId: "someone-else" })
    await expect(action()).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("answers UPSTREAM_UNAVAILABLE while Redis is down", async () => {
    jest.mocked(isDeduplicatedJobPending).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(action()).resolves.toEqual({ success: false, code: "UPSTREAM_UNAVAILABLE", error: QUEUE })
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(action()).resolves.toEqual({ success: false, code: "UPSTREAM_UNAVAILABLE", error: QUEUE })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("startCleanupFirstRead", () => {
  it("enqueues a system read with no snapshot and no read, and writes no audit row", async () => {
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: true } })
    expect(prismaMock.cleanupSnapshot.findFirst).toHaveBeenCalledWith({ where: { status: "complete" }, select: { id: true } })
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.CLEANUP_READ, { trigger: "system", chain: false }, expect.objectContaining({
      deduplication: { id: "cleanup:read" }, jobId: expect.any(String),
    }))
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("enqueues nothing with a snapshot, a read claim or a pending read", async () => {
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValueOnce({ id: "snap-1" } as never)
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: false } })
    stored({ readClaimAt: new Date(NOW - 60_000) })
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: false } })
    stored()
    jest.mocked(isDeduplicatedJobPending).mockResolvedValueOnce({ ok: true, value: true })
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: false } })
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it("enqueues nothing without Redis, and answers false when the queue does not answer or the add joined a read", async () => {
    jest.mocked(isRedisConfigured).mockReturnValueOnce(false)
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: false } })
    jest.mocked(isDeduplicatedJobPending).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: false } })
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: true, jobId: "someone-else" })
    await expect(startCleanupFirstRead()).resolves.toEqual({ success: true, data: { queued: false } })
  })
})
