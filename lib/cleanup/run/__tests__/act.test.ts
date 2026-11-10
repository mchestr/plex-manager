/**
 * @jest-environment node
 */

/**
 * The act step (TS 8.8, E19, E20, E31, E32, owner-r2-1, owner-r3-1,
 * safety-r2-8): the stops before any change, recovery and reconcile, the
 * plan of today and the budget, each per-item check in order, the rule check
 * on fresh rules and options (with the real engine), each pre-delete result,
 * the stops of the step (pause, off, shutdown, `auditFailed`, `arrRefused`)
 * and the Overseerr availability sync. The re-read and the delete are mocked
 * here; `pre-delete.test.ts` and `delete.test.ts` cover them.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))
const mockLog = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: (...a: unknown[]) => mockLog(...a) }))
const mockSettings = jest.fn()
jest.mock("@/lib/cleanup/settings", () => ({ ...jest.requireActual("@/lib/cleanup/settings"), readCleanupSettingsRow: () => mockSettings() }))
const mockContext = jest.fn()
jest.mock("@/lib/cleanup/run/run-claim", () => ({ ...jest.requireActual("@/lib/cleanup/run/run-claim"), loadReconcileContext: (...a: unknown[]) => mockContext(...a) }))
const mockReconcile = jest.fn()
jest.mock("@/lib/cleanup/run/reconcile", () => ({ reconcile: (...a: unknown[]) => mockReconcile(...a) }))
const mockRecover = jest.fn()
jest.mock("@/lib/cleanup/run/recover", () => ({ recoverDeleting: (...a: unknown[]) => mockRecover(...a) }))
const mockExit = jest.fn()
jest.mock("@/lib/cleanup/run/exit", () => ({ ...jest.requireActual("@/lib/cleanup/run/exit"), exitItem: (...a: unknown[]) => mockExit(...a) }))
const mockPre = { preDelete: jest.fn(), prepareChecks: jest.fn(), loadActServices: jest.fn() }
jest.mock("@/lib/cleanup/run/pre-delete", () => ({ ...jest.requireActual("@/lib/cleanup/run/pre-delete"), preDelete: (...a: unknown[]) => mockPre.preDelete(...a),
  prepareChecks: (...a: unknown[]) => mockPre.prepareChecks(...a), loadActServices: () => mockPre.loadActServices() }))
const mockDelete = { deleteItem: jest.fn(), exitDeleted: jest.fn() }
jest.mock("@/lib/cleanup/run/delete", () => ({ deleteItem: (...a: unknown[]) => mockDelete.deleteItem(...a), exitDeleted: (...a: unknown[]) => mockDelete.exitDeleted(...a) }))
const mockAvailability = jest.fn()
jest.mock("@/lib/connections/overseerr-cleanup", () => ({ runOverseerrJob: (...a: unknown[]) => mockAvailability(...a) }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildCondition, buildDefinition, buildLiveFacts, buildMovieItem, buildOptions, buildSnapshotFacts, buildSourceStatuses, NOW }
  from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { ruleBlocks } from "@/lib/cleanup/rule-blocks"
import { actStep, candidatesToday, stillAdmin } from "@/lib/cleanup/run/act"
import type { ActServices } from "@/lib/cleanup/run/pre-delete"
import type { LiveRule, ReconcileContext } from "@/lib/cleanup/run/reconcile"
import type { SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { CleanupSettingsRow } from "@/lib/cleanup/settings"
import type { CleanupItem, CleanupRule } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

const UPDATED = new Date("2026-11-08T03:00:00Z")
const MOVIE = buildMovieItem()
const MOVIE_2 = buildMovieItem({ key: "movie:tmdb:1002", titleKey: "tmdb:1002", ratingKey: "5002", copies: [{ ratingKey: "5002", sectionId: "1" }],
  ids: { tmdb: 1002 }, arr: { ...MOVIE.arr!, id: 12, path: "/media/movies/Second (2020)" } })
const MATCHES: RuleDefinition = buildDefinition({ conditions: [buildCondition("watch.lastPlayed", { value: { duration: { amount: 90, unit: "days" }, orNever: true } })] })
const services: ActServices = { plex: { url: "http://plex.test", token: "t" }, radarr: { url: "http://radarr.test", apiKey: "k" }, sonarr: null, tautulli: null,
  overseerr: { url: "http://seerr.test", apiKey: "o" } }
const BASE_OPTIONS = buildOptions({ protections: { g7: { enabled: false } } })

let rules: CleanupRule[] = []
let items: Map<string, CleanupItem> = new Map()
let settingsQueue: Partial<CleanupSettingsRow>[] = []

const rule = (overrides: Partial<CleanupRule> = {}) => buildCleanupRule({ id: "rule-a", mode: "automatic", revision: 1, definition: MATCHES,
  createdAt: new Date("2026-01-01T00:00:00Z"), ...overrides })
const row = (item: SnapshotItem, overrides: Partial<CleanupItem> = {}) => buildCleanupItem({ id: `id-${item.key}`, itemKey: item.key, level: item.level,
  titleKey: item.titleKey, sectionId: item.sectionId, ratingKey: item.ratingKey, arr: { service: "radarr", id: item.arr!.id, titleSlug: "slug", path: item.arr!.path },
  ruleIds: ["rule-a"], action: "movie.delete", importListExclusion: true, state: "leaving", leaveOn: "2026-11-01", enteredAt: new Date("2026-10-01T00:00:00Z"), updatedAt: UPDATED,
  sizeBytes: 12n * 1024n ** 3n, ...overrides })

function settingsOf(overrides: Partial<CleanupSettingsRow> = {}): CleanupSettingsRow {
  return { ...buildCleanupSettings({ enabled: true }), options: BASE_OPTIONS, runtime: { collections: {}, notices: [] }, ...overrides }
}

/** The context that `loadReconcileContext()` gives the step: the snapshot, the real evaluation context and the live rules with their blocks. */
function contextOf(input: { options?: CleanupOptions; snapshotItems?: SnapshotItem[]; sources?: SourceStatus[]; settings?: Partial<CleanupSettingsRow>
  rules?: CleanupRule[]; noSnapshot?: boolean } = {}): ReconcileContext {
  const options = input.options ?? BASE_OPTIONS
  const sources = input.sources ?? buildSourceStatuses()
  const facts = buildSnapshotFacts({ membersRead: ["Favourites"], rowBaseline: {} })
  const list = input.snapshotItems ?? [MOVIE, MOVIE_2]
  const level = { level: "movie" as const, items: list, byKey: new Map(list.map((i) => [i.key, i])), byTitleKey: new Map() }
  const header = { id: "snap-2", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW), sources, facts }
  const evaluation = buildEvalContext({ now: NOW, zone: "UTC", facts, sources, shows: [], live: buildLiveFacts(), options })
  const live = new Map<string, LiveRule>((input.rules ?? rules).filter((r) => r.mode !== "dryRun").map((r) => {
    const definition = r.definition as RuleDefinition
    return [r.id, { id: r.id, mode: "automatic", revision: r.revision, createdAt: r.createdAt, definition, compiled: compileDefinition(definition),
      blocks: ruleBlocks(definition, { finishedAt: header.finishedAt, sources, facts }, { now: NOW, options, ruleId: r.id }) }]
  }))
  return { now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: "run-1", actorId: "system", settings: settingsOf({ options, ...input.settings }),
    snapshot: input.noSnapshot ? null : { header, levels: { movie: level, show: null, season: null } }, evaluation: input.noSnapshot ? null : evaluation,
    rules: live }
}

const input = (overrides: Partial<Parameters<typeof actStep>[0]> = {}) => ({ runId: "run-1", trigger: "scheduled", actorId: "system", now: new Date(NOW), reconciled: true, ...overrides })
const writes = () => prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args.data)
const deleted = () => mockDelete.deleteItem.mock.calls.map(([r]) => (r as CleanupItem).itemKey)

beforeEach(() => {
  mockReset(prismaMock)
  for (const fn of [mockLog, mockSettings, mockContext, mockReconcile, mockRecover, mockExit, mockAvailability, ...Object.values(mockPre), ...Object.values(mockDelete)]) fn.mockReset()
  rules = [rule()]
  items = new Map([[`id-${MOVIE.key}`, row(MOVIE)]])
  settingsQueue = []
  mockSettings.mockImplementation(async () => settingsOf(settingsQueue.length > 1 ? settingsQueue.shift() : settingsQueue[0]))
  mockContext.mockImplementation(async () => contextOf())
  mockPre.loadActServices.mockResolvedValue(services)
  mockPre.prepareChecks.mockResolvedValue({ roots: { radarr: ["/media/movies"], sonarr: null }, tags: { radarr: new Map(), sonarr: null }, requests: [] })
  mockPre.preDelete.mockResolvedValue({ kind: "go", record: {} })
  mockDelete.deleteItem.mockResolvedValue({ kind: "deleted", freedBytes: 1n, alreadyGone: false })
  mockDelete.exitDeleted.mockResolvedValue(true)
  mockExit.mockResolvedValue({ exited: true, outcomeId: "o", detail: {} })
  mockAvailability.mockResolvedValue({ ok: true, data: null })
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.cleanupItem.findMany.mockImplementation((async () => [...items.values()]) as never)
  prismaMock.cleanupItem.findUnique.mockImplementation((async (args: { where: { id: string } }) => items.get(args.where.id) ?? null) as never)
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupRule.findMany.mockImplementation((async (args?: { where?: { id?: { in: string[] } } }) =>
    rules.filter((r) => !args?.where?.id || args.where.id.in.includes(r.id))) as never)
  prismaMock.cleanupOutcome.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } } as never)
  prismaMock.user.findUnique.mockResolvedValue({ isAdmin: true } as never)
})

describe("stops before any change (TS 8.8 step 1)", () => {
  it.each([["off", { enabled: false }, "off"], ["paused", { pausedAt: new Date(NOW) }, "paused"]])("stops while %s", async (_name, settings, code) => {
    mockContext.mockImplementation(async () => contextOf({ settings }))
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "paused", blocks: [{ code }], deleted: 0 })
    expect(mockRecover).not.toHaveBeenCalled()
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
  })

  it("stops with no change before holdUntil", async () => {
    mockContext.mockImplementation(async () => contextOf({ settings: { holdUntil: "2026-11-09" } }))
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "finished", deleted: 0, seen: [] })
    expect(mockRecover).not.toHaveBeenCalled()
  })
})

describe("recovery, reconcile and the plan (steps 2 to 4)", () => {
  it("recovers deleting rows without clearing approvals, and reconciles only when the caller did not (E19)", async () => {
    await actStep(input({ reconciled: true }))
    expect(mockRecover).toHaveBeenCalledWith(prismaMock, { clearApproval: false })
    expect(mockReconcile).not.toHaveBeenCalled()
    await actStep(input({ reconciled: false }))
    expect(mockReconcile).toHaveBeenCalledWith({ ctx: expect.objectContaining({ runId: "run-1" }) })
    expect(mockRecover.mock.invocationCallOrder[1]).toBeLessThan(mockReconcile.mock.invocationCallOrder[0])
  })

  it("adds readFailed after a failed or busy read and deletes nothing (safety-r2-8)", async () => {
    for (const readStatus of ["failed", "busy"] as const) {
      await expect(actStep(input({ readStatus }))).resolves.toMatchObject({ outcome: "blocked", blocks: [{ code: "readFailed" }], seen: [] })
    }
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("takes only the candidates planned for today within the budget, in plan order (the budget stop)", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2, { sizeBytes: 30n * 1024n ** 3n }))
    items.set("id-held", row(MOVIE, { id: "id-held", itemKey: "movie:tmdb:7", state: "leaving", needsApproval: true }))
    mockContext.mockImplementation(async () => contextOf({ options: buildOptions({ budget: { items: 1 }, protections: { g7: { enabled: false } } }) }))
    const result = await actStep(input())
    expect(result.seen).toEqual([MOVIE_2.key])
    expect(deleted()).toEqual([MOVIE_2.key])
  })

  it("leaves out items whose holding rules are all blocked, and gives the keys of today for the job's rounds", async () => {
    mockContext.mockImplementation(async () => contextOf({ sources: buildSourceStatuses({ tautulli: { state: "failed" } }) }))
    await expect(actStep(input())).resolves.toMatchObject({ seen: [], deleted: 0 })
    mockContext.mockImplementation(async () => contextOf())
    await expect(candidatesToday(new Date(NOW))).resolves.toEqual([MOVIE.key])
  })

  it("holds every candidate as planned and stops when Overseerr failed in the prepare step (step 5.4, TS 10.1 rule 6)", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2))
    mockPre.prepareChecks.mockResolvedValue(null)
    // A Postpone committed on the second row after the plan: its hold write matches no row
    prismaMock.cleanupItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "blocked", held: 1, blocks: [{ code: "sourceFailed", service: "overseerr" }] })
    for (const key of [MOVIE.key, MOVIE_2.key]) {
      expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({ where: { id: `id-${key}`, updatedAt: UPDATED }, data: { holdCode: "sourceFailed:overseerr" } })
    }
    expect(mockPre.prepareChecks).toHaveBeenCalledWith(services, { oldestSince: Date.parse("2026-01-01T00:00:00.000Z"), g9: true, signal: undefined })
  })
})

describe("the per-item checks (step 6)", () => {
  it("deletes only item 1 when a pause commits between item 1 and item 2 (E20)", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2))
    settingsQueue = [{}, { pausedAt: new Date(NOW) }]
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "paused", blocks: [{ code: "paused" }], deleted: 1 })
    expect(deleted()).toEqual([MOVIE.key])
  })

  it("stops before item 2 when the feature goes off, or when the delete's own guard finds it off", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2))
    settingsQueue = [{}, { enabled: false }]
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "paused", blocks: [{ code: "off" }] })
    settingsQueue = []
    mockDelete.deleteItem.mockReset().mockResolvedValueOnce({ kind: "stopped" })
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "paused", blocks: [{ code: "paused" }] })
    expect(mockDelete.deleteItem).toHaveBeenCalledTimes(1)
  })

  it("stops between items on shutdown", async () => {
    const shutdown = new AbortController()
    shutdown.abort()
    await expect(actStep(input({ signal: shutdown.signal }))).resolves.toMatchObject({ outcome: "stopped", blocks: [{ code: "stopped" }] })
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("skips an item that is gone, changed since the plan, or no longer a candidate", async () => {
    prismaMock.cleanupItem.findUnique.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row(MOVIE, { updatedAt: new Date(NOW) }))
      .mockResolvedValueOnce(row(MOVIE, { holdCode: "noValue:date" }))
    await actStep(input())
    await actStep(input())
    await actStep(input())
    expect(mockPre.preDelete).not.toHaveBeenCalled()
  })

  it("moves an approved item back to leaving when its approver is no longer an admin", async () => {
    items.set(`id-${MOVIE.key}`, row(MOVIE, { state: "approved", approvedAt: new Date(NOW), approvedBy: "admin-1", needsApproval: true }))
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false } as never)
    await actStep(input())
    expect(writes()).toEqual([{ state: "leaving", approvedAt: null, approvedBy: null }])
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("holds an item of unknown size with noValue:size", async () => {
    items.set(`id-${MOVIE.key}`, row(MOVIE, { sizeBytes: 0n }))
    await expect(actStep(input())).resolves.toMatchObject({ held: 1 })
    expect(writes()).toEqual([{ holdCode: "noValue:size" }])
    expect(mockPre.preDelete).not.toHaveBeenCalled()
  })

  it("runs the full checks on an item that recovery moved back from deleting", async () => {
    items.set(`id-${MOVIE.key}`, row(MOVIE, { state: "approved", approvedAt: new Date(NOW), approvedBy: "admin-1", needsApproval: true }))
    rules = [rule({ mode: "reviewFirst" })]
    await actStep(input())
    expect(mockRecover).toHaveBeenCalled()
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "admin-1" }, select: { isAdmin: true } })
    expect(mockPre.preDelete).toHaveBeenCalledTimes(1)
    expect(deleted()).toEqual([MOVIE.key])
  })
})

describe("the rule check on fresh rules and options (step 6.5, owner-r2-1)", () => {
  it("rescues when a rule protection was saved after the reconcile and before the candidate read", async () => {
    mockContext.mockImplementation(async () => contextOf({ rules: [rule()] }))
    rules = [rule({ revision: 2, definition: { ...MATCHES, protections: [buildCondition("watch.lastPlayed", { id: "p1", op: "lessThan",
      value: { duration: { amount: 365, unit: "days" }, orNever: false } })] } })]
    await actStep(input())
    expect(mockExit).toHaveBeenCalledWith(expect.objectContaining({ itemKey: MOVIE.key }), expect.objectContaining({ kind: "rescued", reason: "protected",
      detail: { protectionId: "p1" }, audit: AuditEventType.CLEANUP_ITEM_RESCUED }))
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("rescues when the G4 days changed in the same window", async () => {
    settingsQueue = [{ options: buildOptions({ protections: { g4: { days: 300 }, g7: { enabled: false } } }) }]
    await actStep(input())
    expect(mockExit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "rescued", reason: "protected", detail: { protectionId: "g4" } }))
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it.each([
    ["G9 tags", { g9: { tags: ["archive"] } }, "g9"],
    ["G13 collections", { g13: { enabled: true, collections: ["Favourites"] } }, "g13"],
  ])("rescues when the %s changed in the same window", async (_name, protections, id) => {
    const tagged = buildMovieItem({ arr: { ...MOVIE.arr!, tags: ["archive"] }, collections: ["Favourites"] })
    mockContext.mockImplementation(async () => contextOf({ snapshotItems: [tagged, MOVIE_2] }))
    settingsQueue = [{ options: buildOptions({ protections: { ...protections, g7: { enabled: false } } }) }]
    await actStep(input())
    expect(mockExit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "protected", detail: { protectionId: id } }))
  })

  it("holds an item whose new rule protection reads a source that failed in the snapshot, and deletes nothing", async () => {
    mockContext.mockImplementation(async () => contextOf({ sources: buildSourceStatuses({ overseerr: { state: "failed" } }) }))
    rules = [rule({ revision: 2, definition: { ...MATCHES, protections: [buildCondition("request.age", { id: "p1", op: "lessThan" })] } })]
    await expect(actStep(input())).resolves.toMatchObject({ deleted: 0 })
    expect(mockPre.preDelete).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it("sets the hold code of an unknown verdict and does not delete", async () => {
    mockContext.mockImplementation(async () => contextOf({ snapshotItems: [buildMovieItem({ match: { state: "unknown", cause: "arrFailed" } })] }))
    await expect(actStep(input())).resolves.toMatchObject({ held: 1 })
    expect(writes()).toEqual([{ holdCode: "matchUnknown" }])
  })

  it("releases an item whose library left its rule after the reconcile, with one released audit row (owner-r3-1, E32)", async () => {
    rules = [rule({ revision: 2, definition: { ...MATCHES, libraries: ["9"] } })]
    await actStep(input())
    expect(mockExit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "released", reason: "libraryRemoved", audit: null }))
    expect(mockLog).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEMS_RELEASED, "system", { ruleId: "rule-a", reason: "libraryRemoved", count: 1,
      itemKeys: [MOVIE.key], more: 0 })
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("releases an item whose only rule went to Dry run or was deleted (ruleOff)", async () => {
    rules = [rule({ mode: "dryRun", revision: 2 })]
    await actStep(input())
    rules = []
    await actStep(input())
    expect(mockExit.mock.calls.map(([, o]) => (o as { reason: string }).reason)).toEqual(["ruleOff", "ruleOff"])
  })

  it("rescues an item that a fresh clause fails, and stops with auditFailed when its exit throws", async () => {
    rules = [rule({ revision: 2, definition: { ...MATCHES, conditions: [buildCondition("watch.lastPlayed")] } })]
    mockExit.mockRejectedValue(new Error("audit down"))
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "auditFailed", blocks: [{ code: "auditFailed" }] })
  })

  it("moves an approved item back to leaving when a save made the action less careful (E31)", async () => {
    items.set(`id-${MOVIE.key}`, row(MOVIE, { state: "approved", approvedAt: new Date(NOW), approvedBy: "admin-1", needsApproval: true,
      action: "movie.unmonitorDeleteFiles" }))
    await actStep(input())
    expect(writes()).toEqual([{ ruleIds: ["rule-a"], action: "movie.delete", importListExclusion: true, needsApproval: false, state: "leaving",
      approvedAt: null, approvedBy: null }])
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("writes a changed merge and deletes with it, and skips a leaving item that now needs approval", async () => {
    items.set(`id-${MOVIE.key}`, row(MOVIE, { importListExclusion: false }))
    const merged = row(MOVIE, { importListExclusion: true, updatedAt: new Date(NOW) })
    prismaMock.cleanupItem.findUnique.mockResolvedValueOnce(items.get(`id-${MOVIE.key}`) ?? null).mockResolvedValueOnce(merged)
    await actStep(input())
    expect(writes()).toEqual([{ ruleIds: ["rule-a"], action: "movie.delete", importListExclusion: true, needsApproval: false }])
    expect(mockDelete.deleteItem.mock.calls[0][0]).toBe(merged)
    rules = [rule({ mode: "reviewFirst" })]
    mockDelete.deleteItem.mockClear()
    await actStep(input())
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("keeps a rule whose definition does not parse as blocked (invalid), and skips the item", async () => {
    mockContext.mockImplementation(async () => contextOf({ rules: [rule()] }))
    rules = [rule({ revision: 3, definition: { level: "movie" } })]
    await actStep(input())
    expect(mockPre.preDelete).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it("deletes nothing after a failed read, also through a rule whose basis moved during the step (safety-r2-8)", async () => {
    mockContext.mockImplementation(async () => contextOf({ rules: [] }))
    rules = [rule({ revision: 2 })]
    await expect(actStep(input({ readStatus: "failed" }))).resolves.toMatchObject({ outcome: "blocked", seen: [MOVIE.key], deleted: 0 })
    expect(mockPre.preDelete).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it("skips every item without a complete snapshot, and plans an approved item with no leave date for today", async () => {
    items.set(`id-${MOVIE.key}`, row(MOVIE, { state: "approved", approvedAt: new Date(NOW), approvedBy: "admin-1", leaveOn: null }))
    mockContext.mockImplementation(async () => contextOf({ noSnapshot: true }))
    await expect(actStep(input())).resolves.toMatchObject({ seen: [MOVIE.key], deleted: 0 })
    expect(mockPre.preDelete).not.toHaveBeenCalled()
    expect(mockPre.prepareChecks).toHaveBeenCalledWith(services, expect.objectContaining({ oldestSince: Date.parse("2026-01-01T00:00:00.000Z") }))
  })

  it("skips an item the snapshot does not hold", async () => {
    mockContext.mockImplementation(async () => contextOf({ snapshotItems: [MOVIE_2] }))
    await actStep(input())
    expect(mockPre.preDelete).not.toHaveBeenCalled()
  })
})

describe("the pre-delete results (steps 6.6 and 6.7)", () => {
  it("passes the row, its arr record, the snapshot item and the fresh options to the re-read", async () => {
    await actStep(input())
    expect(mockPre.preDelete).toHaveBeenCalledWith({ row: items.get(`id-${MOVIE.key}`), arr: { service: "radarr", id: 11, titleSlug: "slug", path: MOVIE.arr!.path },
      item: MOVIE, show: null }, expect.objectContaining({ services, options: BASE_OPTIONS, takenAt: NOW, zone: "UTC" }))
    expect(mockDelete.deleteItem).toHaveBeenCalledWith(items.get(`id-${MOVIE.key}`), expect.objectContaining({ id: 11 }), expect.objectContaining({ runId: "run-1",
      today: "2026-11-08", collections: {} }))
  })

  it("exits a gone record as deleted with no arr call", async () => {
    mockPre.preDelete.mockResolvedValue({ kind: "gone" })
    await expect(actStep(input())).resolves.toMatchObject({ deleted: 1 })
    expect(mockDelete.exitDeleted).toHaveBeenCalledWith(expect.objectContaining({ itemKey: MOVIE.key }), expect.anything(), { runId: "run-1",
      alreadyGone: true, match: "updatedAt" })
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("rescues with the re-read's reason, holds, and defers", async () => {
    mockPre.preDelete.mockResolvedValueOnce({ kind: "rescue", reason: "played" }).mockResolvedValueOnce({ kind: "hold", code: "sourceFailed:tautulli" })
      .mockResolvedValueOnce({ kind: "defer" })
    await actStep(input())
    expect(mockExit).toHaveBeenCalledWith(expect.anything(), { kind: "rescued", reason: "played", detail: undefined, runId: "run-1", actorId: "system" })
    await expect(actStep(input())).resolves.toMatchObject({ held: 1 })
    await expect(actStep(input())).resolves.toMatchObject({ deferred: 1 })
    expect(writes()).toEqual([{ holdCode: "sourceFailed:tautulli" }, { deferredAt: new Date(NOW) }])
    expect(mockDelete.deleteItem).not.toHaveBeenCalled()
  })

  it("stops with arrRefused on a 401 of the re-read or the delete", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2))
    mockPre.preDelete.mockResolvedValueOnce({ kind: "hold", code: "sourceFailed:radarr", refused: "radarr" })
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "arrRefused", blocks: [{ code: "arrRefused", service: "radarr" }] })
    mockDelete.deleteItem.mockResolvedValueOnce({ kind: "failed", code: "HTTP", status: 401, refused: "radarr" })
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "arrRefused" })
    expect(mockDelete.deleteItem).toHaveBeenCalledTimes(1)
  })

  it("goes on after a failed delete, and stops with auditFailed when the delete's exit failed", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2))
    mockDelete.deleteItem.mockResolvedValueOnce({ kind: "failed", code: "HTTP", status: 500 })
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "finished", deleted: 1 })
    mockDelete.deleteItem.mockResolvedValueOnce({ kind: "auditFailed" })
    await expect(actStep(input())).resolves.toMatchObject({ outcome: "auditFailed", deleted: 0 })
  })
})

describe("after the loop (step 7)", () => {
  it("runs the Overseerr availability sync once after deletions, and logs a failure", async () => {
    items.set(`id-${MOVIE_2.key}`, row(MOVIE_2))
    mockAvailability.mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(actStep(input())).resolves.toMatchObject({ deleted: 2 })
    expect(mockAvailability).toHaveBeenCalledTimes(1)
    expect(mockAvailability).toHaveBeenCalledWith(services.overseerr, "availability-sync", { signal: undefined })
  })

  it("runs no sync without a deletion, or without Overseerr", async () => {
    mockPre.preDelete.mockResolvedValue({ kind: "defer" })
    await actStep(input())
    mockPre.preDelete.mockResolvedValue({ kind: "go", record: {} })
    mockPre.loadActServices.mockResolvedValue({ ...services, overseerr: null })
    await actStep(input())
    expect(mockAvailability).not.toHaveBeenCalled()
  })
})

describe("stillAdmin", () => {
  it("gives the user while they are an admin, else null", async () => {
    await expect(stillAdmin("admin-1")).resolves.toBe("admin-1")
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expect(stillAdmin("admin-1")).resolves.toBeNull()
    await expect(stillAdmin(null)).resolves.toBeNull()
  })
})
