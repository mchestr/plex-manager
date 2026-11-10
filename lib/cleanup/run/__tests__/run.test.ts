/**
 * @jest-environment node
 */

/**
 * The run (TS 8.3, E10, E13, E14, E19, UX 0.4 item 6): live and dry runs,
 * the busy paths, the feature blocks, invalid rule definitions, the step
 * order, the outcomes, the counts from the run's outcome rows, and a database
 * error that leaves `finishedAt` empty and still releases the claim. The
 * steps it calls (reconcile, entries, the act step, prune) are mocked; the
 * rule evaluation is real.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
const mockWarn = jest.fn()
const mockError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: (...a: unknown[]) => mockError(...a), warn: (...a: unknown[]) => mockWarn(...a) }),
}))
const mockRecord = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: (...a: unknown[]) => mockRecord(...a) }))
const mockSettings = jest.fn()
jest.mock("@/lib/cleanup/settings", () => ({ ...jest.requireActual("@/lib/cleanup/settings"), readCleanupSettingsRow: () => mockSettings() }))
const mockClaim = { takeRunClaim: jest.fn(), releaseRunClaim: jest.fn(), loadReconcileContext: jest.fn() }
jest.mock("@/lib/cleanup/run/run-claim", () => ({ takeRunClaim: (...a: unknown[]) => mockClaim.takeRunClaim(...a),
  releaseRunClaim: (...a: unknown[]) => mockClaim.releaseRunClaim(...a), loadReconcileContext: (...a: unknown[]) => mockClaim.loadReconcileContext(...a) }))
const mockSteps = { reconcile: jest.fn(), addNewMatches: jest.fn(), actStep: jest.fn(), pruneCleanup: jest.fn(), recoverDeleting: jest.fn(),
  requestCollectionSync: jest.fn(), addJob: jest.fn() }
jest.mock("@/lib/cleanup/run/reconcile", () => ({ reconcile: (...a: unknown[]) => mockSteps.reconcile(...a) }))
jest.mock("@/lib/cleanup/run/entries", () => ({ addNewMatches: (...a: unknown[]) => mockSteps.addNewMatches(...a) }))
jest.mock("@/lib/cleanup/run/act", () => ({ actStep: (...a: unknown[]) => mockSteps.actStep(...a) }))
jest.mock("@/lib/cleanup/run/prune", () => ({ pruneCleanup: (...a: unknown[]) => mockSteps.pruneCleanup(...a) }))
jest.mock("@/lib/cleanup/run/recover", () => ({ recoverDeleting: (...a: unknown[]) => mockSteps.recoverDeleting(...a) }))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: (...a: unknown[]) => mockSteps.requestCollectionSync(...a) }))
jest.mock("@/lib/queue/client", () => ({ addJob: (...a: unknown[]) => mockSteps.addJob(...a) }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildCondition, buildDefinition, buildLiveFacts, buildMovieItem, buildOptions, buildSnapshotFacts, buildSourceStatuses, NOW }
  from "@/lib/cleanup/__tests__/helpers/builders"
import type { Block } from "@/lib/cleanup/blocks"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { ruleBlocks } from "@/lib/cleanup/rule-blocks"
import type { LiveRule, ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { BUSY_DELAY_MS, runCleanup, type RunCleanupOptions } from "@/lib/cleanup/run/run"
import { definitionHash } from "@/lib/cleanup/run/turn-on-review"
import type { CleanupSettingsRow } from "@/lib/cleanup/settings"
import type { CleanupRule } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

const MOVIE = buildMovieItem()
const BIG = buildMovieItem({ key: "movie:tmdb:1002", titleKey: "tmdb:1002", ratingKey: "5002", ids: { tmdb: 1002 }, sizeBytes: 90 * 1024 ** 3 })
const MATCHES: RuleDefinition = buildDefinition({ conditions: [buildCondition("watch.lastPlayed", { value: { duration: { amount: 90, unit: "days" }, orNever: true } })] })
const OPTIONS = buildOptions({ protections: { g7: { enabled: false } } })
const HELD = { claim: { column: "runClaimAt" }, baseline: { rules: [], optionsHash: "h" } }

let rules: CleanupRule[] = []
let settingsQueue: Partial<CleanupSettingsRow>[] = []
const order: string[] = []
const track = (name: string, value?: unknown) => async () => (order.push(name), value)

const rule = (overrides: Partial<CleanupRule> = {}) => buildCleanupRule({ id: "rule-live", mode: "automatic", definition: MATCHES, ...overrides })
const settingsOf = (overrides: Partial<CleanupSettingsRow> = {}): CleanupSettingsRow =>
  ({ ...buildCleanupSettings({ enabled: true }), options: OPTIONS, runtime: { collections: {}, notices: [] }, ...overrides })

function contextOf(input: { snapshot?: boolean; settings?: Partial<CleanupSettingsRow>; blocks?: Block[] } = {}): ReconcileContext {
  const facts = buildSnapshotFacts({ rowBaseline: {} })
  const sources = buildSourceStatuses()
  const items = [MOVIE, BIG]
  const header = { id: "snap-2", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW), sources, facts }
  const live = new Map<string, LiveRule>(rules.filter((r) => r.mode !== "dryRun").flatMap((r): [string, LiveRule][] => {
    const definition = r.definition as RuleDefinition
    if (!definition.conditions) return [[r.id, { id: r.id, mode: "automatic", revision: 1, createdAt: r.createdAt, definition: null, compiled: null,
      blocks: [{ code: "invalid", ruleId: r.id }] }]]
    return [[r.id, { id: r.id, mode: "automatic", revision: r.revision, createdAt: r.createdAt, definition, compiled: compileDefinition(definition),
      blocks: input.blocks ?? ruleBlocks(definition, { finishedAt: header.finishedAt, sources, facts }, { now: NOW, options: OPTIONS, ruleId: r.id }) }]]
  }))
  const on = input.snapshot !== false
  return { now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: null, actorId: "system", settings: settingsOf(input.settings),
    snapshot: on ? { header, levels: { movie: { level: "movie", items, byKey: new Map(items.map((i) => [i.key, i])), byTitleKey: new Map() }, show: null,
      season: null } } : null,
    evaluation: on ? buildEvalContext({ now: NOW, zone: "UTC", facts, sources, shows: [], live: buildLiveFacts(), options: OPTIONS }) : null, rules: live }
}

const options = (overrides: Partial<RunCleanupOptions> = {}): RunCleanupOptions =>
  ({ trigger: "scheduled", actorId: "system", act: true, readStatus: "complete", now: new Date(NOW), ...overrides })
const runUpdate = () => prismaMock.cleanupRun.update.mock.calls[0]?.[0].data
const statsWrites = () => prismaMock.cleanupRule.updateMany.mock.calls.map(([args]) => ({ id: (args.where as { id: string }).id, data: args.data }))

beforeEach(() => {
  mockReset(prismaMock)
  for (const fn of [mockWarn, mockError, mockRecord, mockSettings, ...Object.values(mockClaim), ...Object.values(mockSteps)]) fn.mockReset()
  order.length = 0
  rules = [rule()]
  settingsQueue = []
  mockSettings.mockImplementation(async () => (order.push("settings"), settingsOf(settingsQueue.length > 1 ? settingsQueue.shift() : settingsQueue[0])))
  mockClaim.takeRunClaim.mockImplementation(track("claim", HELD))
  mockClaim.releaseRunClaim.mockImplementation(track("release", { rounds: 0 }))
  mockClaim.loadReconcileContext.mockImplementation(async () => (order.push("context"), contextOf()))
  mockSteps.reconcile.mockImplementation(track("reconcile", { checked: 1, rescued: 0, released: 0, updated: 1, skipped: 0, rescuedByRule: {} }))
  mockSteps.addNewMatches.mockImplementation(track("entries", { rules: [{ ruleId: "rule-live", checked: 2, candidates: 1, held: false, waitingBatch: false,
    joined: [BIG.key], heldKeys: [] }], joined: 1, held: 0, protectedNow: 0 }))
  mockSteps.actStep.mockImplementation(track("act", { outcome: "finished", blocks: [], deleted: 1, deferred: 2, held: 0, seen: [] }))
  mockSteps.pruneCleanup.mockImplementation(track("prune"))
  mockSteps.recoverDeleting.mockImplementation(track("recover", 0))
  mockSteps.requestCollectionSync.mockImplementation(track("sync"))
  mockRecord.mockImplementation(track("audit"))
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.cleanupRule.findMany.mockImplementation((async () => rules) as never)
  prismaMock.cleanupRule.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupRun.create.mockImplementation((async () => (order.push("row"), { id: "run-1" })) as never)
  prismaMock.cleanupRun.update.mockImplementation((async () => (order.push("finish"), {})) as never)
  prismaMock.cleanupOutcome.findMany.mockResolvedValue([])
})

describe("a live run (TS 8.3)", () => {
  it("runs the steps in order under the claim and releases through releaseRunClaim()", async () => {
    await expect(runCleanup(options())).resolves.toMatchObject({ busy: false, runId: "run-1", outcome: "finished", matched: 2, joined: 1, deferred: 2 })
    expect(order).toEqual(["settings", "claim", "context", "row", "settings", "recover", "reconcile", "entries", "settings", "act", "prune", "finish", "audit",
      "release", "sync"])
    expect(mockSteps.recoverDeleting).toHaveBeenCalledWith(prismaMock, { clearApproval: false })
    expect(mockSteps.reconcile).toHaveBeenCalledWith({ ctx: expect.objectContaining({ runId: "run-1" }) })
    expect(mockSteps.actStep).toHaveBeenCalledWith({ runId: "run-1", trigger: "scheduled", actorId: "system", signal: undefined, now: new Date(NOW),
      reconciled: true, readStatus: "complete" })
    expect(mockClaim.releaseRunClaim).toHaveBeenCalledWith(HELD.claim, HELD.baseline, { actorId: "system", runId: "run-1" })
    expect(mockSteps.requestCollectionSync).toHaveBeenCalledWith("run")
  })

  it("creates the run row and writes rule statistics without touching the revision", async () => {
    await runCleanup(options())
    expect(prismaMock.cleanupRun.create).toHaveBeenCalledWith({ data: { kind: "run", trigger: "scheduled", actorId: null, snapshotId: "snap-2",
      ruleIds: ["rule-live"] }, select: { id: true } })
    const [write] = statsWrites()
    expect(write.id).toBe("rule-live")
    expect(write.data).not.toHaveProperty("revision")
    expect(write.data).not.toHaveProperty("lastDryRunAt")
    expect(write.data.stats).toMatchObject({ v: 1, dryRuns: [], lastEval: { runId: "run-1", snapshotId: "snap-2", checked: 2, matches: 2, largest: ["5002", "5001"],
      overlaps: [], blocks: [] } })
  })

  it("counts rescued, deleted and failed titles from the run's outcomes, per rule too, and writes CLEANUP_RUN", async () => {
    prismaMock.cleanupOutcome.findMany.mockResolvedValue([{ kind: "deleted", ruleIds: ["rule-live"], freedBytes: 10n },
      { kind: "rescued", ruleIds: ["rule-live"], freedBytes: 0n }, { kind: "failed", ruleIds: [], freedBytes: 0n }, { kind: "released", ruleIds: [], freedBytes: 0n }] as never)
    await expect(runCleanup(options())).resolves.toMatchObject({ rescued: 1, deleted: 1, failed: 1, freedBytes: "10" })
    expect(runUpdate()).toMatchObject({ rescued: 1, deleted: 1, failed: 1, freedBytes: 10n, outcome: "finished", finishedAt: expect.any(Date),
      entries: [{ ruleId: "rule-live", mode: "automatic", matches: 2, joined: 1, held: 0, rescued: 1, deleted: 1, failed: 0, blocks: [] }] })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_RUN, "system", { runId: "run-1", kind: "run", trigger: "scheduled", outcome: "finished",
      checked: 2, matched: 2, joined: 1, held: 0, deferred: 2, rescued: 1, deleted: 1, failed: 1, freedBytes: "10", blocks: [] })
  })

  it("logs a failed CLEANUP_RUN write and still finishes", async () => {
    mockRecord.mockRejectedValue(new Error("audit down"))
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "finished" })
    expect(mockError).toHaveBeenCalledWith("cleanup.run_audit_failed", expect.any(Error), { runId: "run-1" })
  })

  it("adds no new matches with entries: false, and requests no sync when nothing changed", async () => {
    mockSteps.reconcile.mockResolvedValue({ checked: 0, rescued: 0, released: 0, updated: 0, skipped: 0, rescuedByRule: {} })
    mockSteps.actStep.mockResolvedValue({ outcome: "finished", blocks: [], deleted: 0, deferred: 0, held: 0, seen: [] })
    await runCleanup(options({ entries: false }))
    expect(mockSteps.addNewMatches).not.toHaveBeenCalled()
    expect(mockSteps.requestCollectionSync).not.toHaveBeenCalled()
  })

  it("never deletes in a run that an admin started, even with act (UX 0.4 item 6)", async () => {
    await expect(runCleanup(options({ trigger: "admin", actorId: "admin-1" }))).resolves.toMatchObject({ outcome: "finished" })
    expect(mockSteps.actStep).not.toHaveBeenCalled()
    expect(prismaMock.cleanupRun.create.mock.calls[0][0].data).toMatchObject({ trigger: "admin", actorId: "admin-1" })
  })

  it.each([
    ["arrRefused", { outcome: "arrRefused", blocks: [{ code: "arrRefused", service: "radarr" }] }, "arrRefused"],
    ["a read that failed", { outcome: "blocked", blocks: [{ code: "readFailed" }] }, "blocked"],
  ])("gives the act step's outcome for %s and stores its blocks", async (_name, act, outcome) => {
    mockSteps.actStep.mockResolvedValue({ deleted: 0, deferred: 0, held: 0, seen: [], ...act })
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome })
    expect(runUpdate().blocks).toEqual(act.blocks)
  })

  it("gives held when the entry check held new matches, and blocked when every live rule is blocked", async () => {
    mockSteps.addNewMatches.mockResolvedValue({ rules: [], joined: 0, held: 3, protectedNow: 0 })
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "held", held: 3 })
    const stop: Block = { code: "dataStale", hours: 40, ruleId: "rule-live" }
    mockClaim.loadReconcileContext.mockImplementation(async () => contextOf({ blocks: [stop] }))
    mockSteps.addNewMatches.mockResolvedValue({ rules: [], joined: 0, held: 0, protectedNow: 0 })
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "blocked" })
    expect(prismaMock.cleanupRun.update.mock.calls[1][0].data.blocks).toEqual([stop])
  })

  it("gives noData without a complete snapshot", async () => {
    mockClaim.loadReconcileContext.mockImplementation(async () => contextOf({ snapshot: false }))
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "noData", checked: 0, matched: 0 })
    expect(prismaMock.cleanupRule.updateMany).not.toHaveBeenCalled()
  })

  it("stops between rules on shutdown, before any change", async () => {
    const shutdown = new AbortController()
    shutdown.abort()
    await expect(runCleanup(options({ signal: shutdown.signal }))).resolves.toMatchObject({ outcome: "stopped" })
    expect(mockSteps.reconcile).not.toHaveBeenCalled()
    expect(mockClaim.releaseRunClaim).toHaveBeenCalled()
  })
})

describe("the feature blocks (TS 8.3 steps 8 to 10)", () => {
  it("records off without a claim or a change, while it still writes the dry-run history", async () => {
    rules = [rule(), rule({ id: "rule-dry", mode: "dryRun" })]
    settingsQueue = [{ enabled: false }]
    mockClaim.loadReconcileContext.mockImplementation(async () => contextOf({ settings: { enabled: false } }))
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "paused" })
    expect(mockClaim.takeRunClaim).not.toHaveBeenCalled()
    expect(mockSteps.reconcile).not.toHaveBeenCalled()
    expect(runUpdate().blocks).toEqual([{ code: "off" }])
    expect(statsWrites().find((w) => w.id === "rule-dry")?.data).toMatchObject({ lastDryRunAt: new Date(NOW) })
  })

  it("skips the changes when a pause commits during the run", async () => {
    settingsQueue = [{}, { pausedAt: new Date(NOW) }]
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "paused" })
    expect(mockSteps.reconcile).not.toHaveBeenCalled()
    expect(runUpdate().blocks).toEqual([{ code: "paused" }])
  })

  it("skips the act step when a pause commits after the reconcile", async () => {
    settingsQueue = [{}, {}, { pausedAt: new Date(NOW) }]
    await expect(runCleanup(options())).resolves.toMatchObject({ outcome: "paused" })
    expect(mockSteps.reconcile).toHaveBeenCalled()
    expect(mockSteps.actStep).not.toHaveBeenCalled()
  })
})

describe("a dry run", () => {
  it("takes no claim, changes no item, and adds a dry-run entry with the definition hash", async () => {
    rules = [rule({ id: "rule-dry", mode: "dryRun", stats: { v: 1, dryRuns: Array.from({ length: 30 }, (_, i) => ({ at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      runId: `r${i}`, snapshotId: "s", matches: 1, bytes: 1, definitionHash: "x" })) } })]
    await expect(runCleanup(options({ trigger: "create", actorId: "admin-1", dryRunRuleIds: ["rule-dry"], act: false }))).resolves.toMatchObject({ outcome: "dryRun",
      matched: 2 })
    expect(mockClaim.takeRunClaim).not.toHaveBeenCalled()
    expect(mockSteps.reconcile).not.toHaveBeenCalled()
    expect(mockSteps.pruneCleanup).toHaveBeenCalled()
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith({ where: { id: { in: ["rule-dry"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    const { data } = statsWrites()[0]
    const { dryRuns } = data.stats as { dryRuns: { runId: string; definitionHash: string; matches: number }[] }
    expect(dryRuns).toHaveLength(30)
    expect(dryRuns[29]).toMatchObject({ runId: "run-1", matches: 2, definitionHash: definitionHash(MATCHES) })
    expect(dryRuns[0].runId).toBe("r1")
    expect(data.lastDryRunAt).toEqual(new Date(NOW))
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_RUN, "admin-1", expect.objectContaining({ kind: "dryRun", outcome: "dryRun", matched: 2 }))
    expect(mockSteps.requestCollectionSync).not.toHaveBeenCalled()
  })

  it("skips and logs a rule whose definition does not parse, with the block invalid", async () => {
    rules = [rule({ id: "rule-bad", mode: "dryRun", definition: { level: "movie" } }), rule()]
    await runCleanup(options())
    expect(mockWarn).toHaveBeenCalledWith("cleanup.rule_invalid", { ruleId: "rule-bad" })
    expect(runUpdate().blocks).toEqual([{ code: "invalid", ruleId: "rule-bad" }])
    expect(statsWrites().map((w) => w.id)).toEqual(["rule-live"])
  })
})

describe("a busy claim (TS 8.3 step 3)", () => {
  beforeEach(() => mockClaim.takeRunClaim.mockResolvedValue(null))

  it("adds a scheduled run again after 10 minutes with waits + 1 (its own job id)", async () => {
    await expect(runCleanup(options({ waits: 2 }))).resolves.toEqual({ busy: true, retry: 3 })
    expect(mockSteps.addJob).toHaveBeenCalledWith("cleanup:run", { trigger: "scheduled", act: true, entries: undefined, readStatus: "complete", waits: 3 },
      { attempts: 1, removeOnComplete: true, removeOnFail: { age: 604800 }, delay: BUSY_DELAY_MS })
    expect(prismaMock.cleanupRun.create).not.toHaveBeenCalled()
  })

  it("writes a run row with outcome busy after 6 waits", async () => {
    await expect(runCleanup(options({ waits: 6 }))).resolves.toEqual({ busy: true })
    expect(mockSteps.addJob).not.toHaveBeenCalled()
    expect(runUpdate()).toMatchObject({ outcome: "busy", blocks: [{ code: "busy" }], finishedAt: expect.any(Date) })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_RUN, "system", expect.objectContaining({ runId: "run-1", outcome: "busy" }))
  })

  it("writes CLEANUP_RUN with runId null for an admin run, and logs a failed write", async () => {
    await expect(runCleanup(options({ trigger: "admin", actorId: "admin-1" }))).resolves.toEqual({ busy: true })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_RUN, "admin-1", { runId: null, kind: "run", trigger: "admin", outcome: "busy", blocks: ["busy"] })
    expect(prismaMock.cleanupRun.create).not.toHaveBeenCalled()
    mockRecord.mockRejectedValue(new Error("audit down"))
    await runCleanup(options({ trigger: "admin", actorId: "admin-1" }))
    expect(mockError).toHaveBeenCalledWith("cleanup.run_audit_failed", expect.any(Error), { runId: null })
  })
})

describe("a database error (TS 8.3, last paragraph)", () => {
  it("throws, leaves finishedAt empty, and still releases the claim", async () => {
    mockSteps.reconcile.mockRejectedValue(new Error("db down"))
    await expect(runCleanup(options())).rejects.toThrow("db down")
    expect(prismaMock.cleanupRun.update).not.toHaveBeenCalled()
    expect(mockClaim.releaseRunClaim).toHaveBeenCalledWith(HELD.claim, HELD.baseline, { actorId: "system", runId: "run-1" })
  })

  it("logs a failed release on the error path and throws the first error", async () => {
    prismaMock.cleanupRun.update.mockRejectedValue(new Error("db down"))
    mockClaim.releaseRunClaim.mockRejectedValue(new Error("release failed"))
    await expect(runCleanup(options())).rejects.toThrow("db down")
    expect(mockError).toHaveBeenCalledWith("cleanup.run_release_failed", expect.any(Error), { runId: "run-1" })
  })
})
