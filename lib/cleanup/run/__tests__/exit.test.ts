/**
 * @jest-environment node
 */

/**
 * Exits (TS 8.4 steps 3 and 5, TS 8.6, E5, E33): the verdict of one holding
 * rule, the kind of an exit, and `exitItem()`: one outcome row, the item row
 * deleted, and the audit row, in one transaction, or nothing.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
const mockRecord = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  recordAuditEvent: (...args: unknown[]) => mockRecord(...args),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildCondition, buildDefinition, buildMovieItem, daysAgo } from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import type { ItemResult } from "@/lib/cleanup/engine/types"
import { ExitSkippedError, exitItem, exitKind, ruleVerdict } from "@/lib/cleanup/run/exit"
import { Prisma } from "@/lib/generated/prisma/client"
import { AuditEventType } from "@/lib/security/audit-log"

const compiled = compileDefinition(buildDefinition({
  conditions: [
    buildCondition("watch.lastPlayed"),
    buildCondition("library.added", { id: "c2" }),
    { id: "a1", kind: "anyOf", conditions: [buildCondition("watch.plays", { id: "c3" }), buildCondition("file.size", { id: "c4" })] },
    buildCondition("file.size", { id: "c5" }),
    buildCondition("show.lastEpisodeAdded", { id: "c6" }),
  ],
}))
const SINCE = daysAgo(30)

function result(overrides: Partial<ItemResult> = {}, plays: number | null = daysAgo(400)): ItemResult {
  const item = buildMovieItem({ plays: { lastCountedAt: plays, countedAt: [], viewers: [] } })
  return { item, clauses: [{ id: "c1", verdict: "pass" }], members: {}, protections: [{ id: "g4", verdict: "clear" }], match: item.match, ...overrides }
}

describe("ruleVerdict", () => {
  it.each([
    ["g1", { keep: false, reason: "kept" }],
    ["g3", { keep: false, reason: "excluded" }],
    ["g2", { keep: false, reason: "markedKeepForever" }],
    ["g6", { keep: false, reason: "protected", detail: { protectionId: "g6" } }],
    ["p1", { keep: false, reason: "protected", detail: { protectionId: "p1" } }],
  ])("drops a rule that %s protects, before a failed clause", (id, verdict) => {
    const r = result({ clauses: [{ id: "c1", verdict: "fail" }], protections: [{ id: "g4", verdict: "clear" }, { id, verdict: "protects" }] })
    expect(ruleVerdict(compiled, r, SINCE)).toEqual(verdict)
  })

  it("gives played for a failed watch clause with a counted play after the entry", () => {
    expect(ruleVerdict(compiled, result({ clauses: [{ id: "c1", verdict: "fail" }] }, daysAgo(2)), SINCE)).toEqual({ keep: false, reason: "played" })
    // a group with a watch member counts as a watch clause
    expect(ruleVerdict(compiled, result({ clauses: [{ id: "a1", verdict: "fail" }] }, daysAgo(2)), SINCE)).toEqual({ keep: false, reason: "played" })
  })

  it.each([
    ["a play before the entry", daysAgo(60)],
    ["no counted play", null],
  ])("gives conditionFailed for a failed watch clause with %s", (_label, plays) => {
    expect(ruleVerdict(compiled, result({ clauses: [{ id: "c1", verdict: "fail" }] }, plays), SINCE))
      .toEqual({ keep: false, reason: "conditionFailed", detail: { conditionId: "c1" } })
  })

  it.each(["c2", "c6"])("gives newContent for a failed %s clause (library.added, show.lastEpisodeAdded)", (id) => {
    expect(ruleVerdict(compiled, result({ clauses: [{ id, verdict: "fail" }] }), SINCE)).toEqual({ keep: false, reason: "newContent" })
  })

  it.each(["c5", "c9"])("gives conditionFailed with the clause id for any other failed clause (%s)", (id) => {
    expect(ruleVerdict(compiled, result({ clauses: [{ id, verdict: "fail" }] }), SINCE))
      .toEqual({ keep: false, reason: "conditionFailed", detail: { conditionId: id } })
  })

  it("keeps a rule with an unknown clause or protection, with the first cause as the hold code", () => {
    const clause = result({ clauses: [{ id: "c1", verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }] })
    expect(ruleVerdict(compiled, clause, SINCE)).toEqual({ keep: true, holdCode: "sourceFailed:tautulli" })
    const protection = result({ clauses: [{ id: "c1", verdict: "unknown" }], protections: [{ id: "g7", verdict: "unknown", cause: { kind: "noValue", what: "requester" } }] })
    expect(ruleVerdict(compiled, protection, SINCE)).toEqual({ keep: true, holdCode: "noValue:requester" })
  })

  it("keeps a rule whose match is unknown, or whose unknown has no cause, with matchUnknown", () => {
    const unknownMatch = result({ match: { state: "unknown", cause: "arrFailed" } })
    expect(ruleVerdict(compiled, unknownMatch, SINCE)).toEqual({ keep: true, holdCode: "matchUnknown" })
    expect(ruleVerdict(compiled, result({ clauses: [{ id: "c1", verdict: "unknown" }] }), SINCE)).toEqual({ keep: true, holdCode: "matchUnknown" })
  })

  it.each([
    ["unmatched", "noArrRecord", { code: "noArrRecord" }],
    ["conflicted", "twoArrRecords", { code: "twoArrRecords" }],
    ["notManaged", undefined, {}],
  ] as const)("drops a rule for a %s match with notManaged and the match cause", (state, cause, detail) => {
    const r = result({ match: cause ? { state, cause } : { state } })
    expect(ruleVerdict(compiled, r, SINCE)).toEqual({ keep: false, reason: "notManaged", detail })
  })

  it("keeps a match", () => {
    expect(ruleVerdict(compiled, result(), SINCE)).toEqual({ keep: true })
  })
})

describe("exitKind", () => {
  it.each([
    ["held", "conditionFailed", "released"],
    ["held", "kept", "released"],
    ["leaving", "ruleOff", "released"],
    ["approved", "libraryRemoved", "released"],
    ["leaving", "notInLibrary", "released"],
    ["leaving", "played", "rescued"],
    ["approved", "protected", "rescued"],
  ])("a %s item that exits for %s is %s", (state, reason, kind) => {
    expect(exitKind(state, reason)).toBe(kind)
  })
})

describe("exitItem", () => {
  const row = buildCleanupItem({ id: "item-1", updatedAt: new Date("2026-11-08T03:00:00.000Z"), approvedBy: "admin-1" })
  const tx = asAppTransactionClient(prismaMock)

  beforeEach(() => {
    mockReset(prismaMock)
    mockRecord.mockReset()
    prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
    prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.cleanupOutcome.create.mockResolvedValue({ id: "outcome-1" } as never)
  })

  it("deletes the row by id and updatedAt, creates the outcome from the row and its why, and audits the rescue, in one transaction", async () => {
    const exit = await exitItem(row, { kind: "rescued", reason: "played", runId: "run-1", actorId: "system" })

    expect(exit).toEqual({ exited: true, outcomeId: "outcome-1", detail: {} })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupItem.deleteMany).toHaveBeenCalledWith({ where: { id: "item-1", updatedAt: row.updatedAt } })
    expect(prismaMock.cleanupOutcome.create).toHaveBeenCalledWith({
      data: {
        itemKey: row.itemKey, level: row.level, titleKey: row.titleKey, sectionId: row.sectionId, ratingKey: row.ratingKey, title: row.title,
        year: row.year, seasonNumber: null, kind: "rescued", reason: "played", detail: Prisma.DbNull, ruleIds: row.ruleIds, action: row.action,
        sizeBytes: row.sizeBytes, freedBytes: 0n, alreadyGone: false, approvedBy: "admin-1", enteredAt: row.enteredAt, leaveOn: row.leaveOn,
        why: row.why, runId: "run-1",
      },
      select: { id: true },
    })
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_RESCUED, "system",
      { runId: "run-1", itemKey: row.itemKey, level: row.level, ruleIds: row.ruleIds, reason: "played" }, prismaMock)
  })

  it("names the detail in the outcome and the audit row", async () => {
    await exitItem(row, { kind: "rescued", reason: "protected", detail: { protectionId: "g9" }, actorId: "admin-1" })

    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ detail: { protectionId: "g9" }, runId: null }))
    expect(mockRecord.mock.calls[0][2]).toEqual({ itemKey: row.itemKey, level: row.level, ruleIds: row.ruleIds, reason: "protected", detail: { protectionId: "g9" } })
  })

  it.each([["rescued"], ["released"]] as const)("adds stillUnmonitored for a %s row whose record a failed delete left unmonitored", async (kind) => {
    const unmonitored = buildCleanupItem({ arr: { service: "sonarr", id: 22, titleSlug: "an-invented-show", path: "/media/tv/Show", unmonitored: true } })
    const exit = await exitItem(unmonitored, { kind, reason: kind === "rescued" ? "played" : "notInLibrary", actorId: "system",
      audit: AuditEventType.CLEANUP_ITEM_RESCUED })

    expect(exit).toEqual(expect.objectContaining({ detail: { stillUnmonitored: "sonarr" } }))
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ detail: { stillUnmonitored: "sonarr" } }))
    expect(mockRecord.mock.calls[0][2]).toEqual(expect.objectContaining({ detail: { stillUnmonitored: "sonarr" } }))
  })

  it("adds no stillUnmonitored to a deletion, nor for a monitored record", async () => {
    const unmonitored = buildCleanupItem({ arr: { service: "radarr", id: 11, titleSlug: "movie", path: "/media/movies/Movie", unmonitored: true } })
    await exitItem(unmonitored, { kind: "deleted", reason: "deleted", actorId: "system" })
    await exitItem(row, { kind: "rescued", reason: "played", actorId: "system" })
    expect(prismaMock.cleanupOutcome.create.mock.calls.map(([args]) => args.data.detail)).toEqual([Prisma.DbNull, Prisma.DbNull])
  })

  it("writes no audit row for a release, or when the caller asks for none", async () => {
    await exitItem(row, { kind: "released", reason: "ruleOff", actorId: "system" })
    await exitItem(row, { kind: "rescued", reason: "excluded", actorId: "admin-1", audit: null })
    expect(mockRecord).not.toHaveBeenCalled()
    expect(prismaMock.cleanupOutcome.create).toHaveBeenCalledTimes(2)
  })

  it("matches { id, state: deleting } for the act step's exits after an arr call, whatever updatedAt says", async () => {
    const deleting = buildCleanupItem({ id: "item-2", state: "deleting", updatedAt: new Date("2026-11-08T03:05:00.000Z") })
    const exit = await exitItem(deleting, {
      kind: "deleted", reason: "deleted", runId: "run-1", actorId: "admin-1", match: "deleting", audit: AuditEventType.CLEANUP_ITEM_DELETED,
      auditDetails: { action: "movie.delete", freedBytes: "5" }, outcome: { freedBytes: 5n, alreadyGone: false, approvedBy: "automatic" },
      why: { v: 1 },
    })

    expect(exit.exited).toBe(true)
    expect(prismaMock.cleanupItem.deleteMany).toHaveBeenCalledWith({ where: { id: "item-2", state: "deleting" } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      kind: "deleted", freedBytes: 5n, alreadyGone: false, approvedBy: "automatic", why: { v: 1 },
    }))
    expect(mockRecord).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEM_DELETED, "admin-1",
      { runId: "run-1", itemKey: deleting.itemKey, level: deleting.level, ruleIds: deleting.ruleIds, action: "movie.delete", freedBytes: "5" }, prismaMock)
  })

  it("stores a JSON null for a row with no why, and an approver the caller clears", async () => {
    await exitItem(buildCleanupItem({ why: null }), { kind: "deleted", reason: "deleted", actorId: "system", outcome: { approvedBy: null } })
    expect(prismaMock.cleanupOutcome.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ why: Prisma.JsonNull, approvedBy: null }))
  })

  it("writes nothing and reports a skip when the delete matches zero rows", async () => {
    prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 0 })
    await expect(exitItem(row, { kind: "rescued", reason: "played", actorId: "system" })).resolves.toEqual({ exited: false })
    expect(prismaMock.cleanupOutcome.create).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it("runs in the caller's transaction, and throws ExitSkippedError there on a zero-row exit with rollback (E33)", async () => {
    await exitItem(row, { kind: "rescued", reason: "kept", actorId: "user-1", audit: null, tx })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()

    prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 0 })
    await expect(exitItem(row, { kind: "rescued", reason: "kept", actorId: "user-1", tx })).resolves.toEqual({ exited: false })
    const error = await exitItem(row, { kind: "rescued", reason: "kept", actorId: "user-1", tx, rollback: true }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ExitSkippedError)
    expect(error).toEqual(expect.objectContaining({ itemKey: row.itemKey, name: "ExitSkippedError", message: "cleanup.exit_skipped" }))
  })

  it("rolls back when the audit write fails: the error leaves the transaction", async () => {
    mockRecord.mockRejectedValue(new Error("audit down"))
    await expect(exitItem(row, { kind: "rescued", reason: "played", actorId: "system" })).rejects.toThrow("audit down")
  })
})
