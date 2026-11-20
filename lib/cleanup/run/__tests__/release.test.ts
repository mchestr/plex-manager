/**
 * @jest-environment node
 */

/**
 * Releases (TS 8.12, 8.4 step 8, 11.1, E31): `releaseRule()` takes out the
 * items whose only live rule leaves the live modes, gives the others a new
 * merge, and writes one `CLEANUP_ITEMS_RELEASED` row. Also the 500-key audit
 * lists, the released groups and the approval check of E31.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
const mockLog = jest.fn()
const mockRecord = jest.fn()
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: (...args: unknown[]) => mockLog(...args),
  recordAuditEvent: (...args: unknown[]) => mockRecord(...args),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupRule } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import type { LiveRule } from "@/lib/cleanup/run/reconcile"
import {
  addReleased,
  AUDIT_KEYS_MAX,
  auditReleased,
  holdingOf,
  keepsApproval,
  keyList,
  mergeLive,
  mergeWrite,
  type ReleasedGroup,
  releaseRule,
  thensOf,
} from "@/lib/cleanup/run/release"
import { AuditEventType } from "@/lib/security/audit-log"

const live = (id: string, overrides: Partial<LiveRule> = {}): LiveRule => {
  const definition = buildDefinition()
  return { id, mode: "automatic", revision: 1, createdAt: new Date("2026-01-01T00:00:00Z"), definition, compiled: compileDefinition(definition),
    blocks: [], ...overrides }
}

beforeEach(() => {
  mockReset(prismaMock)
  mockLog.mockReset()
  mockRecord.mockReset()
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupOutcome.create.mockResolvedValue({ id: "outcome" } as never)
})

describe("keyList", () => {
  it("keeps every key up to 500", () => {
    expect(keyList(["a", "b"])).toEqual({ count: 2, itemKeys: ["a", "b"], more: 0 })
  })

  it("keeps 500 keys and counts the rest in more", () => {
    const keys = Array.from({ length: 503 }, (_, i) => `movie:tmdb:${i}`)
    const list = keyList(keys)
    expect(AUDIT_KEYS_MAX).toBe(500)
    expect(list.itemKeys).toHaveLength(500)
    expect(list).toEqual(expect.objectContaining({ count: 503, more: 3 }))
  })
})

describe("released groups", () => {
  it("groups keys by rule and reason, and writes one row per group with keys", () => {
    const groups = new Map<string, ReleasedGroup>()
    addReleased(groups, "rule-1", "ruleOff", "movie:tmdb:1")
    addReleased(groups, "rule-1", "ruleOff", "movie:tmdb:2")
    addReleased(groups, "rule-1", "libraryRemoved", "movie:tmdb:3")
    auditReleased([...groups.values(), { ruleId: "rule-2", reason: "ruleOff", keys: [] }], "admin-1")

    expect(mockLog.mock.calls).toEqual([
      [AuditEventType.CLEANUP_ITEMS_RELEASED, "admin-1", { ruleId: "rule-1", reason: "ruleOff", count: 2, itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], more: 0 }],
      [AuditEventType.CLEANUP_ITEMS_RELEASED, "admin-1", { ruleId: "rule-1", reason: "libraryRemoved", count: 1, itemKeys: ["movie:tmdb:3"], more: 0 }],
    ])
  })
})

describe("the approval check (E31) and the merge", () => {
  it.each([
    ["the same action", "movie.delete", false, "movie.delete", false, true],
    ["a more careful action", "movie.delete", false, "movie.unmonitorDeleteFiles", false, true],
    ["a less careful action", "movie.unmonitorDeleteFiles", false, "movie.delete", false, false],
    ["the exclusion turning on", "movie.delete", false, "movie.delete", true, false],
    ["the exclusion turning off", "movie.delete", true, "movie.delete", false, true],
    ["a stored action this build does not know", "movie.recycle", false, "movie.unmonitorDeleteFiles", false, false],
  ] as const)("%s keeps the approval: %s", (_label, stored, storedExclusion, action, importListExclusion, keeps) => {
    expect(keepsApproval({ action: stored, importListExclusion: storedExclusion }, { action, importListExclusion })).toBe(keeps)
  })

  it("writes the merge, and clears the approval of an approved row only where E31 says so", () => {
    const merged = { action: "movie.delete", importListExclusion: true, needsApproval: true, batchRuleId: "rule-1" } as const
    const careful = { action: "movie.unmonitorDeleteFiles", importListExclusion: false }
    expect(mergeWrite({ state: "approved", ...careful }, merged)).toEqual({ action: "movie.delete", importListExclusion: true, needsApproval: true,
      state: "leaving", approvedAt: null, approvedBy: null })
    expect(mergeWrite({ state: "leaving", ...careful }, merged)).toEqual({ action: "movie.delete", importListExclusion: true, needsApproval: true })
    expect(mergeWrite({ state: "approved", action: "movie.delete", importListExclusion: true }, merged)).not.toHaveProperty("state")
  })

  it("merges live rules, and gives null when one has no definition that parses, or for none", () => {
    const careful = live("rule-2", { definition: buildDefinition({ then: { graceDays: 60, action: "movie.unmonitorDeleteFiles", importListExclusion: false } }) })
    expect(mergeLive([live("rule-1"), careful])).toEqual(expect.objectContaining({ action: "movie.unmonitorDeleteFiles", importListExclusion: false }))
    expect(mergeLive([live("rule-1"), live("rule-3", { definition: null, compiled: null })])).toBeNull()
    expect(mergeLive([])).toBeNull()
    expect(holdingOf(live("rule-3", { definition: null }))).toBeNull()
    expect(thensOf([live("rule-1"), live("rule-3", { definition: null })]).map((rule) => rule.id)).toEqual(["rule-1"])
  })
})

describe("releaseRule", () => {
  const otherRules = () => [
    buildCleanupRule({ id: "rule-b", mode: "reviewFirst", definition: buildDefinition({ then: { graceDays: 30, action: "movie.delete", importListExclusion: true } }) }),
    buildCleanupRule({ id: "rule-bad", mode: "automatic", definition: { schemaVersion: 99 } }),
  ]

  it("releases items whose only live rule it was, re-merges the others, and writes one audit row with the Leaving soon keys", async () => {
    const rows = [
      buildCleanupItem({ id: "only", itemKey: "movie:tmdb:1", ruleIds: ["rule-a"], state: "leaving" }),
      buildCleanupItem({ id: "only-approved", itemKey: "movie:tmdb:2", ruleIds: ["rule-a", "rule-dry"], state: "approved" }),
      buildCleanupItem({ id: "held", itemKey: "movie:tmdb:3", ruleIds: ["rule-a"], state: "held", leaveOn: null }),
      buildCleanupItem({ id: "shared", itemKey: "movie:tmdb:4", ruleIds: ["rule-a", "rule-b"], state: "approved", action: "movie.unmonitorDeleteFiles" }),
      buildCleanupItem({ id: "invalid-other", itemKey: "movie:tmdb:5", ruleIds: ["rule-a", "rule-bad"], state: "leaving" }),
    ]
    prismaMock.cleanupItem.findMany.mockResolvedValue(rows)
    prismaMock.cleanupRule.findMany.mockResolvedValue(otherRules())

    await expect(releaseRule("rule-a", "admin-1")).resolves.toEqual({ released: 2, held: 1, updated: 2, skipped: 0 })

    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledWith({
      where: { ruleIds: { has: "rule-a" }, state: { in: ["held", "leaving", "approved"] } }, orderBy: { itemKey: "asc" },
    })
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { not: "rule-a" }, mode: { not: "dryRun" } } }))
    const outcomes = prismaMock.cleanupOutcome.create.mock.calls.map(([args]) => [args.data.itemKey, args.data.kind, args.data.reason])
    expect(outcomes).toEqual([["movie:tmdb:1", "released", "ruleOff"], ["movie:tmdb:2", "released", "ruleOff"], ["movie:tmdb:3", "released", "ruleOff"]])
    expect(prismaMock.cleanupItem.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { id: "shared", updatedAt: rows[3].updatedAt }, data: { ruleIds: ["rule-b"], action: "movie.delete", importListExclusion: true,
        needsApproval: true, state: "leaving", approvedAt: null, approvedBy: null } },
      { where: { id: "invalid-other", updatedAt: rows[4].updatedAt }, data: { ruleIds: ["rule-bad"] } },
    ])
    expect(mockRecord).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenCalledTimes(1)
    expect(mockLog).toHaveBeenCalledWith(AuditEventType.CLEANUP_ITEMS_RELEASED, "admin-1",
      { ruleId: "rule-a", reason: "ruleOff", count: 2, itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], more: 0 })
  })

  it("counts the rows that an action changed meanwhile as skipped, and writes no audit row without a released title", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([
      buildCleanupItem({ id: "gone", ruleIds: ["rule-a"] }),
      buildCleanupItem({ id: "changed", ruleIds: ["rule-a", "rule-b"] }),
    ])
    prismaMock.cleanupRule.findMany.mockResolvedValue(otherRules())
    prismaMock.cleanupItem.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 0 })

    await expect(releaseRule("rule-a", "admin-1", { runId: "run-1" })).resolves.toEqual({ released: 0, held: 0, updated: 0, skipped: 2 })
    expect(mockLog).not.toHaveBeenCalled()
  })
})
