/**
 * @jest-environment node
 */

/**
 * The media cleanup rule actions (TS 10.2, 10.3): refused callers, input
 * validation, the rate limit, every error code that applies, the success
 * paths with their audit rows, enqueues and revalidations, the revision
 * compare-and-set of saves and mode changes, the exits of a live save
 * (claimed and busy), the turn-on checks with nothing changed on a refusal,
 * the Review first refusal of a Dry run rule, and a copy in Dry run.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import {
  createCleanupRule,
  createCleanupRuleFromRecipe,
  deleteCleanupRule,
  duplicateCleanupRule,
  moveCleanupRuleToDryRun,
  runCleanupRuleDryRun,
  saveCleanupRule,
  setCleanupRuleReviewFirst,
  turnOnCleanupRule,
} from "@/actions/admin/cleanup-rules"
import { buildCleanupItem, buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildCondition, buildDefinition, buildMovieItem, buildOptions, buildRuntime, buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import type { Claim } from "@/lib/cleanup/claims"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import type { ItemResult } from "@/lib/cleanup/engine/types"
import { draftImpact } from "@/lib/cleanup/preview/impact"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { joinItems } from "@/lib/cleanup/run/entries"
import { reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { releaseRule } from "@/lib/cleanup/run/release"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { computeTurnOnReview, type TurnOnReview } from "@/lib/cleanup/run/turn-on-review"
import { type CleanupSettingsRow, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { loadPreviousCompleteHeader, type SnapshotHeader } from "@/lib/cleanup/snapshot/store"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import { getActiveService } from "@/lib/data/active-service"
import { Prisma } from "@/lib/generated/prisma/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { getFormat } from "@/lib/settings/app-settings"
import { bindFormat } from "@/lib/utils/format"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/store", () => ({ loadPreviousCompleteHeader: jest.fn() }))
jest.mock("@/lib/cleanup/settings", () => ({ ...jest.requireActual("@/lib/cleanup/settings"), readCleanupSettingsRow: jest.fn() }))
jest.mock("@/lib/cleanup/preview/run-preview", () => ({ runPreview: jest.fn() }))
jest.mock("@/lib/cleanup/run/run-claim", () => ({ takeRunClaim: jest.fn(), releaseRunClaim: jest.fn(), loadReconcileContext: jest.fn() }))
jest.mock("@/lib/cleanup/run/reconcile", () => ({ reconcile: jest.fn() }))
jest.mock("@/lib/cleanup/run/release", () => ({ ...jest.requireActual("@/lib/cleanup/run/release"), releaseRule: jest.fn() }))
jest.mock("@/lib/cleanup/run/turn-on-review", () => ({ computeTurnOnReview: jest.fn() }))
jest.mock("@/lib/cleanup/run/entries", () => ({ joinItems: jest.fn() }))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({ getFormat: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const RULE = "rule-1"
const HASH = "a".repeat(64)
const OTHER_HASH = "b".repeat(64)
const CLAIM: Claim = { column: "runClaimAt", lost: new AbortController().signal, value: () => new Date(NOW) }
const BASELINE = { rules: [], optionsHash: "0" }
const HEADER: SnapshotHeader = {
  id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW), sources: [],
  facts: buildSnapshotFacts(),
}
const DEFINITION = buildDefinition()
const STALE_WORDS = "The numbers changed. Check them again."
const RULE_CONFLICT = "Someone changed this rule. Reload it and try again."
const RUN_CONFLICT = "A run is in progress. Try again in a few minutes."

const settingsRow = (overrides: Partial<CleanupSettingsRow> = {}): CleanupSettingsRow =>
  ({ ...buildCleanupSettings({ enabled: true }), options: buildOptions(), runtime: buildRuntime(), ...overrides })

/** The rule rows: the default is a Dry run movie rule at revision 1. */
const ruleRow = (overrides: Parameters<typeof buildCleanupRule>[0] = {}) => buildCleanupRule({ id: RULE, definition: DEFINITION, ...overrides })

/** The audit rows of one type. */
const audits = (type: AuditEventType) => jest.mocked(logAuditEvent).mock.calls.filter(([t]) => t === type).map(([, , details]) => details)

const result = (): ItemResult => {
  const item = buildMovieItem()
  return { item, clauses: [], members: {}, protections: [], match: item.match }
}

function reconcileCtx(): ReconcileContext {
  return { now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: null, actorId: "system", settings: settingsRow(), snapshot: null,
    evaluation: null, rules: new Map() }
}

function buildReview(overrides: Partial<TurnOnReview> = {}, definition: RuleDefinition = DEFINITION): TurnOnReview {
  return {
    rule: { id: RULE, name: "Unwatched movies", mode: "dryRun", revision: 1, definition },
    joinRule: { id: RULE, mode: "reviewFirst", revision: 2, createdAt: new Date(NOW), definition, compiled: compileDefinition(definition), blocks: [] },
    mode: "reviewFirst",
    set: [{ itemKey: "movie:tmdb:101", sizeBytes: 100, leaveOn: null, result: result() }, { itemKey: "movie:tmdb:9", sizeBytes: 1, leaveOn: null, result: null }],
    count: 2, keysHash: HASH, bytes: 101,
    counts: { checked: 10, matches: 2, protected: 0, missing: 0, cannotDelete: 0, due: 0 },
    checks: [], modes: [], leaveAt: "2026-12-08", pace: null, oversize: [], typedApprovalCount: null, reviewedAt: new Date(NOW).toISOString(),
    ctx: reconcileCtx(),
    ...overrides,
  }
}

const turnOnInput = (overrides: Partial<Parameters<typeof turnOnCleanupRule>[0]> = {}) => ({
  ruleId: RULE, mode: "reviewFirst" as const, expectedRevision: 1, count: 2, keysHash: HASH, reviewedAt: new Date(NOW - 60_000).toISOString(), ...overrides,
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(getActiveService).mockResolvedValue({ id: "service-1" } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(enqueueFromRequest).mockImplementation(async (_type, _data, options) => ({ ok: true, jobId: String(options?.jobId) }))
  jest.mocked(loadPreviousCompleteHeader).mockResolvedValue(HEADER)
  jest.mocked(readCleanupSettingsRow).mockResolvedValue(settingsRow())
  jest.mocked(takeRunClaim).mockResolvedValue({ claim: CLAIM, baseline: BASELINE })
  jest.mocked(releaseRunClaim).mockResolvedValue({ rounds: 0 })
  jest.mocked(loadReconcileContext).mockResolvedValue(reconcileCtx())
  jest.mocked(reconcile).mockResolvedValue({ checked: 3, rescued: 1, released: 2, updated: 0, skipped: 0, rescuedByRule: {} })
  jest.mocked(releaseRule).mockResolvedValue({ released: 4, held: 1, updated: 2, skipped: 0 })
  jest.mocked(joinItems).mockResolvedValue({ joined: ["movie:tmdb:101"], skipped: 0 })
  jest.mocked(computeTurnOnReview).mockResolvedValue(buildReview())
  jest.mocked(requestCollectionSync).mockResolvedValue({ flagged: true, queued: true })
  jest.mocked(getFormat).mockResolvedValue(bindFormat({ timeZone: "UTC", locale: "en-US" }))
  jest.mocked(runPreview).mockResolvedValue({ impact: undefined } as never)
  prismaMock.cleanupRule.findMany.mockResolvedValue([])
  prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow())
  prismaMock.cleanupRule.create.mockResolvedValue(ruleRow({ id: "rule-new" }))
  prismaMock.cleanupRule.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupRule.deleteMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 3 })
})

afterEach(() => jest.useRealTimers())

const CALLS = [
  ["createCleanupRule", () => createCleanupRule({ name: "Old movies", definition: DEFINITION })],
  ["createCleanupRuleFromRecipe", () => createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: {} })],
  ["saveCleanupRule", () => saveCleanupRule({ ruleId: RULE, name: "Old movies", definition: DEFINITION, expectedRevision: 1 })],
  ["duplicateCleanupRule", () => duplicateCleanupRule({ ruleId: RULE })],
  ["deleteCleanupRule", () => deleteCleanupRule({ ruleId: RULE })],
  ["turnOnCleanupRule", () => turnOnCleanupRule(turnOnInput())],
  ["setCleanupRuleReviewFirst", () => setCleanupRuleReviewFirst({ ruleId: RULE })],
  ["moveCleanupRuleToDryRun", () => moveCleanupRuleToDryRun({ ruleId: RULE })],
  ["runCleanupRuleDryRun", () => runCleanupRuleDryRun({ ruleId: RULE })],
] as const

const BAD_INPUT = [
  ["createCleanupRule", () => createCleanupRule({ name: " ", definition: DEFINITION })],
  ["createCleanupRuleFromRecipe", () => createCleanupRuleFromRecipe({ recipeId: "big-movies", values: { ["k".repeat(31)]: 1 } })],
  ["saveCleanupRule", () => saveCleanupRule({ ruleId: RULE, name: "Old movies", definition: { ...DEFINITION, libraries: [] }, expectedRevision: 1 })],
  ["duplicateCleanupRule", () => duplicateCleanupRule({ ruleId: "bad id!" })],
  ["deleteCleanupRule", () => deleteCleanupRule({ ruleId: "" })],
  ["turnOnCleanupRule", () => turnOnCleanupRule(turnOnInput({ keysHash: "nope" }))],
  ["setCleanupRuleReviewFirst", () => setCleanupRuleReviewFirst({ ruleId: "x".repeat(41) })],
  ["moveCleanupRuleToDryRun", () => moveCleanupRuleToDryRun({ ruleId: "a/b" })],
  ["runCleanupRuleDryRun", () => runCleanupRuleDryRun({ ruleId: "a b" })],
] as const

describe("every rule action", () => {
  it.each(CALLS)("%s refuses a signed-out caller and a member, and changes nothing", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(call()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "member-1", isAdmin: false }, expires: "" })
    await expect(call()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.cleanupRule.findUnique).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each(CALLS)("%s spends the per-admin admin:cleanup limit", async (_name, call) => {
    jest.mocked(consume).mockResolvedValueOnce({ ok: false, retryAfterSec: 30 })
    await expect(call()).resolves.toMatchObject({ success: false, code: "RATE_LIMITED", retryAfterSec: 30 })
    expect(consume).toHaveBeenCalledWith("admin:cleanup", "admin-1")
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each(BAD_INPUT)("%s parses its input", async (_name, call) => {
    await expect(call()).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(consume).not.toHaveBeenCalled()
  })

  it("never returns the text of a thrown error", async () => {
    prismaMock.cleanupRule.findUnique.mockRejectedValueOnce(new Error("connect ECONNREFUSED db:5432"))
    await expect(deleteCleanupRule({ ruleId: RULE })).resolves.toEqual({ success: false, code: "INTERNAL", error: "Could not delete the rule. Try again." })
  })
})

describe("createCleanupRule", () => {
  it("creates the rule in Dry run at revision 1, audits it and queues its first dry run with its own job id", async () => {
    await expect(createCleanupRule({ name: "Old movies", definition: DEFINITION })).resolves.toEqual({ success: true, data: { ruleId: "rule-new", dryRunQueued: true } })
    expect(prismaMock.cleanupRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Old movies", mode: "dryRun", revision: 1, definition: DEFINITION, schemaVersion: 1, origin: { kind: "blank" },
        stats: {}, turnedOnAt: null, lastDryRunAt: null, createdBy: "admin-1", updatedBy: "admin-1" }),
      select: { id: true },
    })
    expect(audits(AuditEventType.CLEANUP_RULE_CREATED)).toEqual([{ ruleId: "rule-new", level: "movie", origin: "blank", conditions: 1 }])
    const [type, data, options] = jest.mocked(enqueueFromRequest).mock.calls[0]
    expect(type).toBe(JOB_TYPES.CLEANUP_RUN)
    expect(data).toEqual({ trigger: "create", dryRunRuleIds: ["rule-new"], dryRunRevision: 1, act: false })
    expect(options).toMatchObject({ attempts: 1, removeOnComplete: true, deduplication: { id: "cleanup:dry-run:rule-new:1" }, jobId: expect.any(String) })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("gives a taken name the next free number", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue([ruleRow({ name: "Old movies" }), ruleRow({ id: "r2", name: "Old movies 2" })])
    await createCleanupRule({ name: "Old movies", definition: DEFINITION })
    expect(prismaMock.cleanupRule.create.mock.calls[0][0].data.name).toBe("Old movies 3")
  })

  it("takes the next free name when another create took the name at the same moment, and stops after three tries", async () => {
    const taken = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7" })
    prismaMock.cleanupRule.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([ruleRow({ name: "Old movies" })])
    prismaMock.cleanupRule.create.mockRejectedValueOnce(taken)
    await expect(createCleanupRule({ name: "Old movies", definition: DEFINITION })).resolves.toMatchObject({ success: true })
    expect(prismaMock.cleanupRule.create.mock.calls.map(([args]) => args.data.name)).toEqual(["Old movies", "Old movies 2"])

    prismaMock.cleanupRule.create.mockReset()
    prismaMock.cleanupRule.create.mockRejectedValue(taken)
    await expect(createCleanupRule({ name: "Old movies", definition: DEFINITION })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
    expect(prismaMock.cleanupRule.create).toHaveBeenCalledTimes(3)
  })

  it("stops at 50 rules", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ruleRow({ id: `r${i}`, name: `Rule ${i}` })))
    await expect(createCleanupRule({ name: "Old movies", definition: DEFINITION })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "You can have at most 50 rules.",
    })
    expect(prismaMock.cleanupRule.create).not.toHaveBeenCalled()
  })

  it.each([
    ["an unknown library", { ...DEFINITION, libraries: ["99"] }, HEADER],
    ["a TV library for a movie rule", { ...DEFINITION, libraries: ["2"] }, HEADER],
    ["a library with no ids", DEFINITION, { ...HEADER, facts: buildSnapshotFacts({ libraries: [{ ...buildSnapshotFacts().libraries[0], noIds: true }] }) }],
    ["a library that Radarr does not manage", DEFINITION, { ...HEADER, facts: buildSnapshotFacts({ libraries: [{ ...buildSnapshotFacts().libraries[0], arr: null }] }) }],
    ["no complete snapshot", DEFINITION, null],
  ])("refuses %s as out of scope", async (_case, definition, header) => {
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValue(header)
    await expect(createCleanupRule({ name: "Old movies", definition })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Choose only libraries that Radarr manages.", fieldErrors: { libraries: ["Choose only libraries that Radarr manages."] },
    })
    expect(prismaMock.cleanupRule.create).not.toHaveBeenCalled()
  })

  it("refuses a field whose service is not set up, under the condition that needs it", async () => {
    jest.mocked(getActiveService).mockImplementation(async (kind) => (kind === "overseerr" ? null : ({ id: "s" } as never)))
    const definition = buildDefinition({ conditions: [buildCondition("watch.lastPlayed"), buildCondition("request.exists", { id: "c2" })] })
    await expect(createCleanupRule({ name: "Old movies", definition })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Set up Overseerr to use this", fieldErrors: { c2: ["Set up Overseerr to use this"] },
    })
  })

  it("keeps the rule when the queue does not answer, and without Redis", async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(createCleanupRule({ name: "Old movies", definition: DEFINITION })).resolves.toEqual({ success: true, data: { ruleId: "rule-new", dryRunQueued: false } })
    jest.mocked(isRedisConfigured).mockReturnValue(false)
    await expect(createCleanupRule({ name: "Old movies", definition: DEFINITION })).resolves.toEqual({ success: true, data: { ruleId: "rule-new", dryRunQueued: false } })
    expect(enqueueFromRequest).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupRule.create).toHaveBeenCalledTimes(2)
  })
})

describe("createCleanupRuleFromRecipe", () => {
  it("builds the recipe on the newest snapshot's libraries, names it after the recipe and stores its origin", async () => {
    await expect(createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: { added: "365d", grace: 60 } })).resolves.toMatchObject({ success: true })
    const { data } = prismaMock.cleanupRule.create.mock.calls[0][0]
    expect(data.name).toBe("Never watched movies")
    expect(data.definition).toMatchObject({ level: "movie", libraries: ["1"], then: { graceDays: 60, action: "movie.delete" } })
    expect(data.origin).toEqual({ kind: "recipe", recipeId: "never-watched-movies", recipeVersion: 1, values: { added: { amount: 365, unit: "days" }, grace: 60 } })
    expect(audits(AuditEventType.CLEANUP_RULE_CREATED)).toEqual([
      { ruleId: "rule-new", level: "movie", origin: "recipe", recipeId: "never-watched-movies", recipeVersion: 1, conditions: 2 },
    ])
  })

  it("takes the asked level of a two-level recipe and the Settings grace when none is given", async () => {
    jest.mocked(readCleanupSettingsRow).mockResolvedValue(settingsRow({ options: buildOptions({ defaults: { graceDays: 45 } }) }))
    await createCleanupRuleFromRecipe({ recipeId: "requested-never-watched", level: "show", values: {} })
    const { data } = prismaMock.cleanupRule.create.mock.calls[0][0]
    expect(data.definition).toMatchObject({ level: "show", libraries: ["2"], then: { graceDays: 45, action: "show.delete" } })
    expect(data.origin).toMatchObject({ values: { requested: { amount: 120, unit: "days" }, lastPlayed: { amount: 180, unit: "days" } } })
  })

  it("refuses values that the recipe does not take, under their key", async () => {
    await expect(createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: { added: "forever" } })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Check the recipe values.", fieldErrors: { added: ["Check the recipe values."] },
    })
    expect(prismaMock.cleanupRule.create).not.toHaveBeenCalled()
  })

  it("refuses a recipe with no library to clean up, and one whose service is not set up", async () => {
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValueOnce(null)
    await expect(createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: {} })).resolves.toMatchObject({
      success: false, code: "VALIDATION", fieldErrors: { libraries: ["Choose only libraries that Radarr manages."] },
    })
    jest.mocked(getActiveService).mockImplementation(async (kind) => (kind === "tautulli" ? null : ({ id: "s" } as never)))
    await expect(createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: {} })).resolves.toMatchObject({
      success: false, code: "VALIDATION", error: "Set up Tautulli to use this",
    })
    expect(prismaMock.cleanupRule.create).not.toHaveBeenCalled()
  })

  it("starts with a read when no complete snapshot exists, and counts a read that joins a pending one as not queued", async () => {
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValueOnce(HEADER).mockResolvedValueOnce(null)
    await expect(createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: {} })).resolves.toMatchObject({ data: { dryRunQueued: true } })
    expect(jest.mocked(enqueueFromRequest).mock.calls[0].slice(0, 2)).toEqual([JOB_TYPES.CLEANUP_READ, { trigger: "system", chain: false, thenDryRunRuleIds: ["rule-new"] }])
    expect(jest.mocked(enqueueFromRequest).mock.calls[0][2]).toMatchObject({ deduplication: { id: "cleanup:read" } })

    jest.mocked(loadPreviousCompleteHeader).mockResolvedValueOnce(HEADER).mockResolvedValueOnce(null)
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: true, jobId: "read-queued-earlier" })
    await expect(createCleanupRuleFromRecipe({ recipeId: "never-watched-movies", values: {} })).resolves.toMatchObject({ data: { dryRunQueued: false } })
  })
})

describe("saveCleanupRule", () => {
  const save = (overrides: Partial<Parameters<typeof saveCleanupRule>[0]> = {}) =>
    saveCleanupRule({ ruleId: RULE, name: "Old movies", definition: DEFINITION, expectedRevision: 1, ...overrides })

  it("saves a Dry run rule with a compare-and-set on the revision it read, and raises it", async () => {
    const after = buildDefinition({ conditions: [buildCondition("watch.lastPlayed"), buildCondition("library.added", { id: "c2" })] })
    await expect(save({ definition: after })).resolves.toEqual({ success: true, data: { revision: 2, exitsApplied: true, released: 0 } })
    expect(prismaMock.cleanupRule.updateMany).toHaveBeenCalledWith({
      where: { id: RULE, revision: 1 },
      data: { name: "Old movies", definition: after, schemaVersion: 1, updatedBy: "admin-1", revision: { increment: 1 } },
    })
    expect(runPreview).not.toHaveBeenCalled()
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
    expect(audits(AuditEventType.CLEANUP_RULE_CHANGED)).toEqual([{
      ruleId: RULE, level: "movie", mode: "dryRun", changed: ["name", "conditions"], added: ["c2"], removed: [], edited: [],
      before: DEFINITION, after,
    }])
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/cleanup/rules/${RULE}`)
  })

  it("refuses a gone rule and a rule that changed since the editor read it, with the stale save words", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(save()).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ revision: 2 }))
    await expect(save()).resolves.toEqual({ success: false, code: "CONFLICT", error: RULE_CONFLICT })
    prismaMock.cleanupRule.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(save()).resolves.toEqual({ success: false, code: "CONFLICT", error: RULE_CONFLICT })
    expect(audits(AuditEventType.CLEANUP_RULE_CHANGED)).toEqual([])
  })

  it("never fails after a dry run that ended since the editor loaded: runs write stats, not the revision", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ stats: { v: 1, dryRuns: [] }, lastDryRunAt: new Date(NOW), updatedAt: new Date(NOW) }))
    await expect(save()).resolves.toMatchObject({ success: true, data: { revision: 2 } })
  })

  it("refuses a name that another rule took, under the name", async () => {
    prismaMock.cleanupRule.updateMany.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "7" }))
    await expect(save({ name: "Taken" })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Another rule has this name. Choose another name.", fieldErrors: { name: ["Another rule has this name. Choose another name."] },
    })
    prismaMock.cleanupRule.updateMany.mockRejectedValueOnce(new Error("lost"))
    await expect(save()).resolves.toMatchObject({ success: false, code: "INTERNAL" })
  })

  it("checks the libraries and the services as a create does", async () => {
    await expect(save({ definition: { ...DEFINITION, libraries: ["2"] } })).resolves.toMatchObject({ success: false, code: "VALIDATION", fieldErrors: { libraries: expect.any(Array) } })
    expect(prismaMock.cleanupRule.updateMany).not.toHaveBeenCalled()
  })

  it("keeps the level of a live rule, and the Automatic grace floor", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "reviewFirst" }))
    const shows = buildDefinition({ level: "show", libraries: ["2"], then: { graceDays: 30, action: "show.delete", importListExclusion: true } })
    await expect(save({ definition: shows })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "To change the level, move the rule back to Dry run, or duplicate it.",
      fieldErrors: { level: ["To change the level, move the rule back to Dry run, or duplicate it."] },
    })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "automatic" }))
    await expect(save({ definition: buildDefinition({ then: { graceDays: 5, action: "movie.delete", importListExclusion: true } }) })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "In Automatic, the grace period is at least 7 days.",
      fieldErrors: { "then.graceDays": ["In Automatic, the grace period is at least 7 days."] },
    })
    expect(prismaMock.cleanupRule.updateMany).not.toHaveBeenCalled()
  })

  it("lets a Dry run rule change its level, and a live rule with an unreadable stored definition save a new one", async () => {
    const shows = buildDefinition({ level: "show", libraries: ["2"], then: { graceDays: 30, action: "show.delete", importListExclusion: true } })
    await expect(save({ definition: shows })).resolves.toMatchObject({ success: true })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "reviewFirst", definition: { broken: true } }))
    await expect(save({ definition: shows })).resolves.toMatchObject({ success: true })
    expect(audits(AuditEventType.CLEANUP_RULE_CHANGED)[1]).toMatchObject({ changed: ["name", "scope", "conditions", "protections", "then"] })
  })

  it("asks a live save that moves titles to confirm the impact first", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "reviewFirst" }))
    jest.mocked(runPreview).mockResolvedValue({ impact: { leave: 4, join: 2, keep: 17, joinLeaveOn: "2026-12-08", items: [], actionChange: 0 } } as never)
    await expect(save()).resolves.toEqual({
      success: false, code: "CLEANUP_IMPACT_UNCONFIRMED", error: "This change moves titles in or out of Leaving soon. Review the change first.",
    })
    expect(runPreview).toHaveBeenCalledWith({ definition: DEFINITION, ruleId: RULE }, { actorId: "admin-1" })
    expect(prismaMock.cleanupRule.updateMany).not.toHaveBeenCalled()

    await expect(save({ confirmImpact: true })).resolves.toEqual({ success: true, data: { revision: 2, exitsApplied: true, released: 3 } })
    expect(audits(AuditEventType.CLEANUP_RULE_CHANGED)[0]).toMatchObject({ mode: "reviewFirst", impact: { leave: 4, join: 2 } })
  })

  it("asks to confirm a live Automatic save that makes the action less careful, though the match set stays the same", async () => {
    const before = buildDefinition({ then: { graceDays: 30, action: "movie.unmonitorDeleteFiles", importListExclusion: false } })
    const after = buildDefinition({ then: { graceDays: 30, action: "movie.delete", importListExclusion: true } })
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "automatic", definition: before }))
    const row = { ...buildCleanupItem({ state: "leaving", ruleIds: [RULE], action: "movie.unmonitorDeleteFiles", importListExclusion: false }), level: "movie" as const,
      action: "movie.unmonitorDeleteFiles" as const }
    jest.mocked(runPreview).mockImplementation(async (request) => {
      const definition = request.definition as RuleDefinition
      const impact = draftImpact({
        rule: { id: RULE, mode: "automatic", createdAt: new Date(NOW), then: definition.then }, compiled: compileDefinition(definition),
        evaluated: new Map(), byKey: new Map(), rows: [row], rowKeys: new Set([row.itemKey]), liveRules: new Map(), blocked: false,
        today: "2026-11-08", holdUntil: null,
      })
      return { impact } as never
    })
    await expect(save({ definition: after })).resolves.toMatchObject({ success: false, code: "CLEANUP_IMPACT_UNCONFIRMED" })
    const { impact } = await jest.mocked(runPreview).mock.results[0].value
    expect(impact).toMatchObject({ leave: 0, join: 0, actionChange: 1 })
    await expect(save({ definition: after, confirmImpact: true })).resolves.toMatchObject({ success: true })
  })

  it("applies the exits of a live save at once under the run claim, then syncs the collections", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "automatic" }))
    await expect(save()).resolves.toEqual({ success: true, data: { revision: 2, exitsApplied: true, released: 3 } })
    expect(loadReconcileContext).toHaveBeenCalledWith({ actorId: "admin-1" })
    expect(reconcile).toHaveBeenCalledWith({ ruleIds: [RULE], ctx: reconcileCtx() })
    expect(releaseRunClaim).toHaveBeenCalledWith(CLAIM, BASELINE, { actorId: "admin-1" })
    expect(requestCollectionSync).toHaveBeenCalled()
    expect(jest.mocked(prismaMock.cleanupRule.updateMany).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(reconcile).mock.invocationCallOrder[0])
  })

  it("skips the exits while a run holds the claim, and says so", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "reviewFirst" }))
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(save()).resolves.toEqual({ success: true, data: { revision: 2, exitsApplied: false, released: 0 } })
    expect(reconcile).not.toHaveBeenCalled()
    expect(releaseRunClaim).not.toHaveBeenCalled()
  })

  it("releases the claim when the reconcile fails", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "reviewFirst" }))
    jest.mocked(reconcile).mockRejectedValueOnce(new Error("boom"))
    await expect(save()).resolves.toMatchObject({ success: false, code: "INTERNAL" })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
  })

  it("makes a turn-on of the old review stale once a save raised the revision", async () => {
    await save()
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ revision: 2 }))
    await expect(turnOnCleanupRule(turnOnInput({ expectedRevision: 1 }))).resolves.toEqual({ success: false, code: "CLEANUP_REVIEW_STALE", error: STALE_WORDS })
    expect(takeRunClaim).not.toHaveBeenCalled()
  })
})

describe("duplicateCleanupRule", () => {
  it("copies an Automatic rule into Dry run at revision 1 with a free name, and queues its dry run", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ name: "Big shows", mode: "automatic", revision: 7, turnedOnAt: new Date(NOW),
      stats: { v: 1, dryRuns: [] }, lastDryRunAt: new Date(NOW) }))
    prismaMock.cleanupRule.findMany.mockResolvedValue([ruleRow({ name: "Big shows" }), ruleRow({ id: "r2", name: "Big shows copy" })])
    await expect(duplicateCleanupRule({ ruleId: RULE })).resolves.toEqual({ success: true, data: { ruleId: "rule-new" } })
    expect(prismaMock.cleanupRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Big shows copy 2", mode: "dryRun", revision: 1, turnedOnAt: null, stats: {}, lastDryRunAt: null,
        definition: DEFINITION, origin: { kind: "duplicate", ruleId: RULE } }),
      select: { id: true },
    })
    expect(audits(AuditEventType.CLEANUP_RULE_CREATED)).toEqual([{ ruleId: "rule-new", level: "movie", origin: "duplicate", sourceRuleId: RULE, conditions: 1 }])
    expect(jest.mocked(enqueueFromRequest).mock.calls[0][1]).toEqual({ trigger: "create", dryRunRuleIds: ["rule-new"], dryRunRevision: 1, act: false })
  })

  it("refuses a gone rule, an unreadable rule and a copy past 50 rules", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(duplicateCleanupRule({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ definition: { level: "nope" } }))
    await expect(duplicateCleanupRule({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    prismaMock.cleanupRule.findMany.mockResolvedValue(Array.from({ length: 50 }, (_, i) => ruleRow({ id: `r${i}`, name: `Rule ${i}` })))
    await expect(duplicateCleanupRule({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "VALIDATION", error: "You can have at most 50 rules." })
    expect(prismaMock.cleanupRule.create).not.toHaveBeenCalled()
  })
})

describe("deleteCleanupRule", () => {
  it("releases the items of a live rule under the run claim, deletes the row, audits and syncs the collections", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "reviewFirst" }))
    await expect(deleteCleanupRule({ ruleId: RULE })).resolves.toEqual({ success: true, data: { released: 4 } })
    expect(releaseRule).toHaveBeenCalledWith(RULE, "admin-1")
    expect(prismaMock.cleanupRule.deleteMany).toHaveBeenCalledWith({ where: { id: RULE } })
    expect(jest.mocked(releaseRule).mock.invocationCallOrder[0]).toBeLessThan(prismaMock.cleanupRule.deleteMany.mock.invocationCallOrder[0])
    expect(releaseRunClaim).toHaveBeenCalledWith(CLAIM, BASELINE, { actorId: "admin-1" })
    expect(audits(AuditEventType.CLEANUP_RULE_DELETED)).toEqual([{ ruleId: RULE, level: "movie", mode: "reviewFirst", released: 4 }])
    expect(requestCollectionSync).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("deletes a Dry run rule with no collection sync, and names no level for an unreadable rule", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ definition: {} }))
    jest.mocked(releaseRule).mockResolvedValueOnce({ released: 0, held: 0, updated: 0, skipped: 0 })
    await expect(deleteCleanupRule({ ruleId: RULE })).resolves.toEqual({ success: true, data: { released: 0 } })
    expect(audits(AuditEventType.CLEANUP_RULE_DELETED)).toEqual([{ ruleId: RULE, level: null, mode: "dryRun", released: 0 }])
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("refuses a gone rule, a rule that another delete took, and a busy claim", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(deleteCleanupRule({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    prismaMock.cleanupRule.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteCleanupRule({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(deleteCleanupRule({ ruleId: RULE })).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(releaseRule).toHaveBeenCalledTimes(1)
    expect(audits(AuditEventType.CLEANUP_RULE_DELETED)).toEqual([])
  })
})

describe("setCleanupRuleReviewFirst", () => {
  it("switches an Automatic rule under the run claim, marks its items for approval and returns the new revision and mode", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "automatic", revision: 4 }))
    await expect(setCleanupRuleReviewFirst({ ruleId: RULE })).resolves.toEqual({ success: true, data: { revision: 5, mode: "reviewFirst" } })
    expect(prismaMock.cleanupRule.updateMany).toHaveBeenCalledWith({
      where: { id: RULE, revision: 4, mode: "automatic" }, data: { mode: "reviewFirst", revision: { increment: 1 }, updatedBy: "admin-1" },
    })
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({
      where: { ruleIds: { has: RULE }, state: { in: ["held", "leaving", "approved"] } }, data: { needsApproval: true },
    })
    expect(releaseRunClaim).toHaveBeenCalled()
    expect(audits(AuditEventType.CLEANUP_RULE_MODE_CHANGED)).toEqual([{ ruleId: RULE, from: "automatic", to: "reviewFirst", typed: false }])
  })

  it.each(["dryRun", "reviewFirst"])("refuses a rule in %s and changes nothing", async (mode) => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode }))
    await expect(setCleanupRuleReviewFirst({ ruleId: RULE })).resolves.toEqual({ success: false, code: "VALIDATION", error: "Turn the rule on from its review page." })
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(prismaMock.cleanupRule.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
  })

  it("refuses a gone rule, a busy claim and a rule that changed meanwhile", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(setCleanupRuleReviewFirst({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "automatic" }))
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(setCleanupRuleReviewFirst({ ruleId: RULE })).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    prismaMock.cleanupRule.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(setCleanupRuleReviewFirst({ ruleId: RULE })).resolves.toEqual({ success: false, code: "CONFLICT", error: RULE_CONFLICT })
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("moveCleanupRuleToDryRun", () => {
  it("moves a live rule to Dry run, releases its items and returns the released count, revision and mode", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "reviewFirst", revision: 3 }))
    await expect(moveCleanupRuleToDryRun({ ruleId: RULE })).resolves.toEqual({ success: true, data: { released: 4, revision: 4, mode: "dryRun" } })
    expect(prismaMock.cleanupRule.updateMany).toHaveBeenCalledWith({
      where: { id: RULE, revision: 3, mode: "reviewFirst" }, data: { mode: "dryRun", revision: { increment: 1 }, updatedBy: "admin-1" },
    })
    expect(releaseRule).toHaveBeenCalledWith(RULE, "admin-1")
    expect(releaseRunClaim).toHaveBeenCalled()
    expect(audits(AuditEventType.CLEANUP_RULE_MODE_CHANGED)).toEqual([{ ruleId: RULE, from: "reviewFirst", to: "dryRun", released: 4, typed: false }])
    expect(requestCollectionSync).toHaveBeenCalled()
  })

  it("changes nothing for a rule already in Dry run", async () => {
    await expect(moveCleanupRuleToDryRun({ ruleId: RULE })).resolves.toEqual({ success: true, data: { released: 0, revision: 1, mode: "dryRun" } })
    expect(takeRunClaim).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses a gone rule, a busy claim and a rule that changed meanwhile", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(moveCleanupRuleToDryRun({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    prismaMock.cleanupRule.findUnique.mockResolvedValue(ruleRow({ mode: "automatic" }))
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(moveCleanupRuleToDryRun({ ruleId: RULE })).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    prismaMock.cleanupRule.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(moveCleanupRuleToDryRun({ ruleId: RULE })).resolves.toEqual({ success: false, code: "CONFLICT", error: RULE_CONFLICT })
    expect(releaseRule).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("runCleanupRuleDryRun", () => {
  it("queues a dry run of the rule at its current revision, audits and revalidates", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ revision: 3 }))
    await expect(runCleanupRuleDryRun({ ruleId: RULE })).resolves.toEqual({ success: true, data: { queued: true } })
    const [type, data, options] = jest.mocked(enqueueFromRequest).mock.calls[0]
    expect(type).toBe(JOB_TYPES.CLEANUP_RUN)
    expect(data).toEqual({ trigger: "admin", actorId: "admin-1", dryRunRuleIds: [RULE], dryRunRevision: 3, act: false })
    expect(options).toMatchObject({ deduplication: { id: `cleanup:dry-run:${RULE}:3` } })
    expect(audits(AuditEventType.CLEANUP_RUN_STARTED)).toEqual([{ kind: "dryRun", queued: true, ruleId: RULE }])
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/cleanup/rules/${RULE}`)
  })

  it("never joins a pending dry run of the revision before a save", async () => {
    await saveCleanupRule({ ruleId: RULE, name: "Old movies", definition: DEFINITION, expectedRevision: 1 })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ revision: 2 }))
    await runCleanupRuleDryRun({ ruleId: RULE })
    expect(jest.mocked(enqueueFromRequest).mock.calls[0][2]).toMatchObject({ deduplication: { id: `cleanup:dry-run:${RULE}:2` } })
  })

  it("joins a pending dry run of the same revision", async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: true, jobId: "queued-earlier" })
    await expect(runCleanupRuleDryRun({ ruleId: RULE })).resolves.toEqual({ success: true, data: { queued: true } })
  })

  it("refuses without Redis, for a gone rule and while the queue does not answer", async () => {
    jest.mocked(isRedisConfigured).mockReturnValueOnce(false)
    await expect(runCleanupRuleDryRun({ ruleId: RULE })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Redis is not set up. Library reads and runs need the job queue.",
    })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(runCleanupRuleDryRun({ ruleId: RULE })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    jest.mocked(enqueueFromRequest).mockResolvedValueOnce({ ok: false, code: "QUEUE_UNAVAILABLE" })
    await expect(runCleanupRuleDryRun({ ruleId: RULE })).resolves.toEqual({
      success: false, code: "UPSTREAM_UNAVAILABLE", error: "The job queue is unavailable. Try again in a minute.",
    })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("turnOnCleanupRule", () => {
  const check = (overrides: Partial<TurnOnCheck>): TurnOnCheck => ({ id: "featureOn", state: "failed", blocks: "all", values: {}, ...overrides })
  const nothingChanged = () => {
    expect(prismaMock.cleanupRule.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.updateMany).not.toHaveBeenCalled()
    expect(joinItems).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  }

  it("turns a Dry run rule on with a compare-and-set, joins its matches with no entry check, audits and syncs", async () => {
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: true, data: { joined: 1, revision: 2 } })
    expect(computeTurnOnReview).toHaveBeenCalledWith(RULE, "reviewFirst", new Date(NOW))
    expect(prismaMock.cleanupRule.updateMany).toHaveBeenCalledWith({
      where: { id: RULE, revision: 1, mode: "dryRun" }, data: { mode: "reviewFirst", revision: { increment: 1 }, updatedBy: "admin-1", turnedOnAt: new Date(NOW) },
    })
    const [ctx, input] = jest.mocked(joinItems).mock.calls[0]
    expect(input.rule).toMatchObject({ id: RULE, mode: "reviewFirst", revision: 2 })
    expect(input.matches).toHaveLength(1)
    expect(ctx.actorId).toBe("admin-1")
    expect(ctx.rules.get(RULE)).toBe(input.rule)
    expect(releaseRunClaim).toHaveBeenCalledWith(CLAIM, BASELINE, { actorId: "admin-1" })
    expect(audits(AuditEventType.CLEANUP_RULE_MODE_CHANGED)).toEqual([{ ruleId: RULE, from: "dryRun", to: "reviewFirst", joined: 1, typed: false }])
    expect(audits(AuditEventType.CLEANUP_ITEMS_ENTERED)).toEqual([{ ruleId: RULE, count: 1, itemKeys: ["movie:tmdb:101"], more: 0 }])
    expect(requestCollectionSync).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/cleanup/rules/${RULE}/turn-on`)
  })

  it("keeps the other live rules in createdAt order in the join context", async () => {
    const definition = DEFINITION
    const other = (id: string, at: number) => ({ id, mode: "automatic" as const, revision: 1, createdAt: new Date(at), definition, compiled: null, blocks: [] })
    const ctx = { ...reconcileCtx(), rules: new Map([["late", other("late", NOW + 1)], ["early", other("early", NOW - 1)], ["same", other("same", NOW)]]) }
    jest.mocked(computeTurnOnReview).mockResolvedValueOnce(buildReview({ ctx }))
    await turnOnCleanupRule(turnOnInput())
    expect([...jest.mocked(joinItems).mock.calls[0][0].rules.keys()]).toEqual(["early", RULE, "same", "late"])
  })

  it("refuses while cleanup is off or paused", async () => {
    jest.mocked(readCleanupSettingsRow).mockResolvedValueOnce(settingsRow({ enabled: false }))
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "CLEANUP_OFF", error: "Media cleanup is off. Turn it on in Settings first." })
    jest.mocked(readCleanupSettingsRow).mockResolvedValueOnce(settingsRow({ pausedAt: new Date(NOW) }))
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "CLEANUP_PAUSED", error: "Cleanup is paused. Resume it first." })
    expect(takeRunClaim).not.toHaveBeenCalled()
    nothingChanged()
  })

  it.each([
    ["older than 15 minutes", NOW - 15 * 60_000 - 1],
    ["more than 60 s ahead", NOW + 60_001],
  ])("refuses a review %s", async (_case, at) => {
    await expect(turnOnCleanupRule(turnOnInput({ reviewedAt: new Date(at).toISOString() }))).resolves.toEqual({
      success: false, code: "CLEANUP_REVIEW_STALE", error: STALE_WORDS,
    })
    expect(takeRunClaim).not.toHaveBeenCalled()
    nothingChanged()
  })

  it("takes a review a little ahead of the server clock", async () => {
    await expect(turnOnCleanupRule(turnOnInput({ reviewedAt: new Date(NOW + 59_000).toISOString() }))).resolves.toMatchObject({ success: true })
  })

  it("refuses a gone rule and a busy claim", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    jest.mocked(takeRunClaim).mockResolvedValueOnce(null)
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "CONFLICT", error: RUN_CONFLICT })
    expect(computeTurnOnReview).not.toHaveBeenCalled()
    nothingChanged()
  })

  it.each([
    ["the rule is gone at the review", null],
    ["a save after the first read raised the revision", buildReview({ rule: { ...buildReview().rule, revision: 2 } })],
    ["the set has another size", buildReview({ count: 3 })],
    ["the set has other titles", buildReview({ keysHash: OTHER_HASH })],
  ])("gives CLEANUP_REVIEW_STALE when %s, releases the claim and changes nothing", async (_case, review) => {
    jest.mocked(computeTurnOnReview).mockResolvedValueOnce(review)
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "CLEANUP_REVIEW_STALE", error: STALE_WORDS })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    nothingChanged()
  })

  it("refuses a failing blocking check with its words, and changes nothing", async () => {
    const stale = check({ id: "libraryData", values: { code: "dataStale", hours: 41 } })
    jest.mocked(computeTurnOnReview).mockResolvedValueOnce(buildReview({ checks: [check({ id: "featureOn", state: "ok" }), stale] }))
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "VALIDATION", error: "Library data is 41 hours old. Refresh it first." })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    nothingChanged()
  })

  it("refuses a failing Automatic check only for Automatic", async () => {
    const grace = check({ id: "grace", blocks: "automatic", values: { graceDays: 5, min: 7 } })
    jest.mocked(computeTurnOnReview).mockResolvedValue(buildReview({ checks: [grace] }))
    await expect(turnOnCleanupRule(turnOnInput({ mode: "automatic" }))).resolves.toEqual({
      success: false, code: "VALIDATION", error: "In Automatic, the grace period is at least 7 days.",
    })
    nothingChanged()
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toMatchObject({ success: true })
  })

  it("needs the typed count above 50 items, and records that it was typed", async () => {
    jest.mocked(computeTurnOnReview).mockResolvedValue(buildReview({ mode: "automatic", typedApprovalCount: 60, count: 60 }))
    await expect(turnOnCleanupRule(turnOnInput({ mode: "automatic", count: 60, typedCount: 59 }))).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Type 60 to confirm.", fieldErrors: { typedCount: ["Type 60 to confirm."] },
    })
    nothingChanged()
    await expect(turnOnCleanupRule(turnOnInput({ mode: "automatic", count: 60, typedCount: 60 }))).resolves.toMatchObject({ success: true })
    expect(audits(AuditEventType.CLEANUP_RULE_MODE_CHANGED)[0]).toMatchObject({ to: "automatic", typed: true })
  })

  it("gives CLEANUP_REVIEW_STALE and creates no item when the compare-and-set finds a newer revision", async () => {
    prismaMock.cleanupRule.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "CLEANUP_REVIEW_STALE", error: STALE_WORDS })
    expect(joinItems).not.toHaveBeenCalled()
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(requestCollectionSync).not.toHaveBeenCalled()
  })

  it("changes the mode of a live rule with the mode it read, and recomputes the approvals of its items", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(ruleRow({ mode: "reviewFirst", revision: 5 }))
    jest.mocked(computeTurnOnReview).mockResolvedValueOnce(buildReview({ rule: { ...buildReview().rule, mode: "reviewFirst", revision: 5 }, mode: "automatic" }))
    prismaMock.cleanupRule.findMany.mockResolvedValueOnce([ruleRow({ id: "other", mode: "reviewFirst" })])
    await expect(turnOnCleanupRule(turnOnInput({ mode: "automatic", expectedRevision: 5 }))).resolves.toEqual({ success: true, data: { joined: 0, revision: 6 } })
    expect(prismaMock.cleanupRule.updateMany).toHaveBeenCalledWith({
      where: { id: RULE, revision: 5, mode: "reviewFirst" }, data: { mode: "automatic", revision: { increment: 1 }, updatedBy: "admin-1" },
    })
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith({ where: { id: { not: RULE }, mode: "reviewFirst" }, select: { id: true } })
    const where = { ruleIds: { has: RULE }, state: { in: ["held", "leaving", "approved"] } }
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({ where: { ...where, NOT: { ruleIds: { hasSome: ["other"] } } }, data: { needsApproval: false } })
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({ where: { ...where, AND: { ruleIds: { hasSome: ["other"] } } }, data: { needsApproval: true } })
    expect(joinItems).not.toHaveBeenCalled()
    expect(audits(AuditEventType.CLEANUP_ITEMS_ENTERED)).toEqual([])
    expect(audits(AuditEventType.CLEANUP_RULE_MODE_CHANGED)).toEqual([{ ruleId: RULE, from: "reviewFirst", to: "automatic", joined: 0, typed: false }])
  })

  it("marks every item for approval when a live rule changes to Review first, and none when no other rule needs one", async () => {
    const live = (mode: "automatic" | "reviewFirst") => buildReview({ rule: { ...buildReview().rule, mode } })
    jest.mocked(computeTurnOnReview).mockResolvedValueOnce(live("automatic"))
    await turnOnCleanupRule(turnOnInput())
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenLastCalledWith({ where: expect.anything(), data: { needsApproval: true } })
    jest.mocked(computeTurnOnReview).mockResolvedValueOnce(live("reviewFirst"))
    await turnOnCleanupRule(turnOnInput({ mode: "automatic" }))
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenLastCalledWith({ where: { ruleIds: { has: RULE }, state: { in: ["held", "leaving", "approved"] } }, data: { needsApproval: false } })
  })

  it("releases the claim when the review fails", async () => {
    jest.mocked(computeTurnOnReview).mockRejectedValueOnce(new Error("snapshot gone"))
    await expect(turnOnCleanupRule(turnOnInput())).resolves.toEqual({ success: false, code: "INTERNAL", error: "Could not turn the rule on. Try again." })
    expect(releaseRunClaim).toHaveBeenCalledTimes(1)
  })
})
