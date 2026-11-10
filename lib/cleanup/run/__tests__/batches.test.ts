/**
 * @jest-environment node
 */

/**
 * Batches and delete candidates (TS 8.7, E7, E28, E35, E36): the batch rule,
 * the hash of a deletion batch, the counts that the approve dialog names,
 * the plan line, the pages, `resolveApproval()` and `selectionOf()`.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { keysHash } from "@/lib/cleanup/keys-hash"
import {
  batchCounts,
  batchHash,
  batchPage,
  batchRuleOf,
  type BatchRules,
  groupBatches,
  loadBatches,
  readUsedToday,
  resolveApproval,
  selectionOf,
} from "@/lib/cleanup/run/batches"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const TODAY = "2026-11-08"
const BUDGET = { items: 20, bytes: 500 * GiB }
const RULES: BatchRules = new Map([
  ["rule-auto", { mode: "automatic", createdAt: new Date("2026-01-01T00:00:00Z") }],
  ["rule-new", { mode: "reviewFirst", createdAt: new Date("2026-03-01T00:00:00Z") }],
  ["rule-old", { mode: "reviewFirst", createdAt: new Date("2026-02-01T00:00:00Z") }],
  ["rule-same", { mode: "reviewFirst", createdAt: new Date("2026-02-01T00:00:00Z") }],
])

const item = (n: number, overrides: Partial<CleanupItem> = {}) => buildCleanupItem({
  id: `item-${n}`, itemKey: `movie:tmdb:${n}`, titleKey: `tmdb:${n}`, state: "leaving", needsApproval: true, ruleIds: ["rule-old"], leaveOn: TODAY,
  sizeBytes: BigInt(n) * BigInt(GiB), action: "movie.delete", importListExclusion: false, ...overrides,
})

const group = (rows: CleanupItem[], extra: Partial<Parameters<typeof groupBatches>[0]> = {}) =>
  groupBatches({ rows, rules: RULES, today: TODAY, holdUntil: null, budget: BUDGET, usedToday: { items: 0, bytes: 0 }, ...extra })

describe("batchHash and batchCounts (E35)", () => {
  const items = [item(1), item(2, { action: "movie.unmonitorDeleteFiles" }), item(3, { importListExclusion: true })]

  it("hashes {itemKey}|{action}|{importListExclusion} of each item with keysHash, in any order", () => {
    expect(batchHash(items)).toBe(keysHash(["movie:tmdb:1|movie.delete|false", "movie:tmdb:2|movie.unmonitorDeleteFiles|false", "movie:tmdb:3|movie.delete|true"]))
    expect(batchHash([...items].reverse())).toBe(batchHash(items))
  })

  it("changes when the merged action or the exclusion of one item changes", () => {
    expect(batchHash([items[0], items[1], { ...items[2], action: "movie.unmonitorDeleteFiles" }])).not.toBe(batchHash(items))
    expect(batchHash([items[0], items[1], { ...items[2], importListExclusion: false }])).not.toBe(batchHash(items))
  })

  it("counts the items per action and with the exclusion for mixed items, and names the least careful action", () => {
    expect(batchCounts(items)).toEqual({ count: 3, bytes: 6n * BigInt(GiB), action: "movie.delete",
      actionCounts: { "movie.delete": 2, "movie.unmonitorDeleteFiles": 1 }, exclusionCount: 1 })
    expect(batchCounts([items[1]]).action).toBe("movie.unmonitorDeleteFiles")
    expect(batchCounts([])).toEqual({ count: 0, bytes: 0n, action: null, actionCounts: {}, exclusionCount: 0 })
  })
})

describe("batchRuleOf (TS 6.8)", () => {
  it("is the first holding Review first rule by createdAt, then by id", () => {
    expect(batchRuleOf({ ruleIds: ["rule-auto", "rule-new", "rule-old"] }, RULES)).toBe("rule-old")
    expect(batchRuleOf({ ruleIds: ["rule-same", "rule-old"] }, RULES)).toBe("rule-old")
    expect(batchRuleOf({ ruleIds: ["rule-same", "rule-new"] }, RULES)).toBe("rule-same")
  })

  it("is null without a holding Review first rule", () => {
    expect(batchRuleOf({ ruleIds: ["rule-auto", "rule-gone"] }, RULES)).toBeNull()
  })
})

describe("groupBatches (TS 8.7)", () => {
  it("puts due leaving items that need approval in the deletion batch of their batch rule, largest first", () => {
    const rows = [item(1), item(3, { leaveOn: "2026-11-01" }), item(2, { ruleIds: ["rule-auto", "rule-new"] }), item(4, { leaveOn: "2026-11-09" }),
      item(5, { state: "approved" })]
    const { deletion, entry } = group(rows)

    expect(deletion.map((b) => [b.id, b.items.map((i) => i.itemKey)])).toEqual([
      ["deletion-rule-old", ["movie:tmdb:3", "movie:tmdb:1"]],
      ["deletion-rule-new", ["movie:tmdb:2"]],
    ])
    const [batch] = deletion
    expect(batch).toEqual(expect.objectContaining({ kind: "deletion", ruleId: "rule-old", count: 2, bytes: 4n * BigInt(GiB), dueSince: "2026-11-01",
      dueAt: TODAY, keysHash: batchHash(batch.items), action: "movie.delete", importListExclusion: false, exclusionCount: 0 }))
    expect(entry).toEqual([])
  })

  it("names no due item before holdUntil", () => {
    expect(group([item(1)], { holdUntil: "2026-11-15" }).deletion).toEqual([])
  })

  it("plans the batch with the other candidates inside the daily budget: today's items and the last day of the rest", () => {
    const rows = [item(10, { state: "approved", needsApproval: false, ruleIds: ["rule-auto"] }), item(2), item(1)]
    const [batch] = group(rows, { budget: { items: 2, bytes: 500 * GiB } }).deletion
    expect(batch.plan).toEqual({ today: { count: 1, bytes: 2n * BigInt(GiB) }, lastDay: "2026-11-09" })

    const [alone] = group([item(1)]).deletion
    expect(alone.plan).toEqual({ today: { count: 1, bytes: BigInt(GiB) }, lastDay: null })
  })

  it("names the batch items larger than the daily space budget (E17)", () => {
    const [batch] = group([item(600), item(1)], { usedToday: { items: 1, bytes: BigInt(GiB) } }).deletion
    expect(batch.oversize).toEqual([{ itemKey: "movie:tmdb:600", day: "2026-11-09" }])
  })

  it("puts held items in the entry batch of each rule that holds them, hashed by key", () => {
    const held = [item(1, { state: "held", leaveOn: null, ruleIds: ["rule-auto", "rule-new"] }), item(2, { state: "held", leaveOn: null, ruleIds: ["rule-auto"] })]
    const { entry, deletion } = group(held)
    expect(deletion).toEqual([])
    expect(entry.map((b) => [b.id, b.count])).toEqual([["entry-rule-auto", 2], ["entry-rule-new", 1]])
    expect(entry[0]).toEqual(expect.objectContaining({ kind: "entry", keysHash: keysHash(["movie:tmdb:1", "movie:tmdb:2"]), dueSince: null, dueAt: null,
      plan: null, oversize: [] }))
  })

  it("lists the delete candidates: approved, deleting and due leaving items with no approval needed, not on hold, not only blocked", () => {
    const rows = [
      item(1, { state: "approved" }), item(2, { state: "deleting" }), item(3, { needsApproval: false, ruleIds: ["rule-auto"] }),
      item(4, { needsApproval: false, leaveOn: "2026-11-20" }), item(5, { state: "approved", holdCode: "noValue:size" }),
      item(6, { state: "approved", ruleIds: ["rule-blocked"] }), item(7, { state: "approved", ruleIds: ["rule-blocked", "rule-old"] }), item(8),
      item(9, { state: "approved", ruleIds: [] }),
    ]
    const { candidates } = group(rows, { blocked: new Set(["rule-blocked"]) })
    expect(candidates.map((c) => c.itemKey)).toEqual(["movie:tmdb:1", "movie:tmdb:2", "movie:tmdb:3", "movie:tmdb:7", "movie:tmdb:9"])
  })
})

describe("readUsedToday and loadBatches", () => {
  beforeEach(() => mockReset(prismaMock))

  it("sums today's deletions in the server zone that were not already gone", async () => {
    prismaMock.cleanupOutcome.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { sizeBytes: 5n } } as never)
    await expect(readUsedToday(TODAY, "Europe/Berlin")).resolves.toEqual({ items: 2, bytes: 5n })
    expect(prismaMock.cleanupOutcome.aggregate).toHaveBeenCalledWith({
      where: { kind: "deleted", alreadyGone: false, actedAt: { gte: new Date("2026-11-07T23:00:00.000Z"), lt: new Date("2026-11-08T23:00:00.000Z") } },
      _count: { _all: true }, _sum: { sizeBytes: true },
    })

    prismaMock.cleanupOutcome.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } } as never)
    await expect(readUsedToday(TODAY, "UTC")).resolves.toEqual({ items: 0, bytes: 0n })
  })

  it("reads the rows, the rules and today's deletions, then groups them", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([item(1)])
    prismaMock.cleanupRule.findMany.mockResolvedValue([{ id: "rule-old", mode: "reviewFirst", createdAt: new Date("2026-02-01T00:00:00Z") }] as never)
    prismaMock.cleanupOutcome.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } } as never)

    const result = await loadBatches({ today: TODAY, zone: "UTC", holdUntil: null, budget: BUDGET })

    expect(result.deletion.map((b) => b.id)).toEqual(["deletion-rule-old"])
    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledWith({ where: { state: { in: ["held", "leaving", "approved", "deleting"] } } })
  })
})

describe("batchPage", () => {
  const items = Array.from({ length: 120 }, (_, i) => item(i + 1))

  it("gives 50 rows a page, and keeps the page inside the batch", () => {
    expect(batchPage({ items }, 1)).toEqual({ rows: items.slice(0, 50), page: 1, pageCount: 3 })
    expect(batchPage({ items }, 3).rows).toHaveLength(20)
    expect(batchPage({ items }, 9).page).toBe(3)
    expect(batchPage({ items }, 0).page).toBe(1)
    expect(batchPage({ items: [] }, 2)).toEqual({ rows: [], page: 1, pageCount: 1 })
  })
})

describe("resolveApproval (E28, E36)", () => {
  const rows = [item(3, { action: "movie.unmonitorDeleteFiles" }), item(2, { importListExclusion: true }), item(1)]
  const [batch] = group(rows).deletion
  const ask = { count: 3, keysHash: batch.keysHash }

  it("approves the batch with a matching count and hash", () => {
    expect(resolveApproval(batch, { ...ask, selected: { count: 3, action: "movie.delete", exclusionCount: 1 } }))
      .toEqual({ status: "ok", items: batch.items, keys: ["movie:tmdb:3", "movie:tmdb:2", "movie:tmdb:1"], excluded: 0 })
  })

  it("is stale for another count or another hash (a changed set)", () => {
    expect(resolveApproval(batch, { ...ask, count: 2 })).toEqual({ status: "stale" })
    expect(resolveApproval(batch, { ...ask, keysHash: batchHash(rows.slice(1)) })).toEqual({ status: "stale" })
  })

  it("leaves out the unticked keys that are in the batch, and ignores an unticked key outside it", () => {
    const result = resolveApproval(batch, { ...ask, excludeKeys: ["movie:tmdb:2", "movie:tmdb:99"],
      selected: { count: 2, action: "movie.delete", exclusionCount: 0 } })
    expect(result).toEqual(expect.objectContaining({ status: "ok", keys: ["movie:tmdb:3", "movie:tmdb:1"], excluded: 1 }))
  })

  it("gives empty when every key is unticked", () => {
    expect(resolveApproval(batch, { ...ask, excludeKeys: rows.map((r) => r.itemKey) })).toEqual({ status: "empty" })
  })

  it.each([
    ["count", { count: 2, action: "movie.delete" as const, exclusionCount: 1 }],
    ["least careful action", { count: 3, action: "movie.unmonitorDeleteFiles" as const, exclusionCount: 1 }],
    ["exclusion count", { count: 3, action: "movie.delete" as const, exclusionCount: 0 }],
  ])("is stale when the selected %s differs from the approved items", (_label, selected) => {
    expect(resolveApproval(batch, { ...ask, selected })).toEqual({ status: "stale" })
  })

  it("needs no selected values for an entry batch", () => {
    const [entry] = group([item(1, { state: "held", leaveOn: null })]).entry
    expect(resolveApproval(entry, { count: 1, keysHash: keysHash(["movie:tmdb:1"]) })).toEqual(expect.objectContaining({ status: "ok", keys: ["movie:tmdb:1"] }))
  })
})

describe("selectionOf (E36)", () => {
  it("gives the batch counts and the asked keys that are still in it, with their values; a key that left is not named", () => {
    const [batch] = group([item(2, { importListExclusion: true }), item(1, { action: "movie.unmonitorDeleteFiles" })]).deletion
    expect(selectionOf(batch, ["movie:tmdb:1", "movie:tmdb:7"])).toEqual({
      count: 2, bytes: String(3 * GiB), keysHash: batch.keysHash, actionCounts: { "movie.delete": 1, "movie.unmonitorDeleteFiles": 1 }, exclusionCount: 1,
      unticked: [{ itemKey: "movie:tmdb:1", action: "movie.unmonitorDeleteFiles", importListExclusion: false, sizeBytes: String(GiB) }],
    })
  })
})
