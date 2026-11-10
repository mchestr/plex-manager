/** The impact of a live rule's draft (TS 10.6 step 7, UX 7.7): leave, join, keep, `actionChange` and the titles of each group. */

import { buildCondition, buildMovieItem, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDraft } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import type { HoldingRule } from "@/lib/cleanup/engine/overlap"
import type { ItemResult } from "@/lib/cleanup/engine/types"
import { buildDraft, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { draftImpact, type ImpactInput, type ImpactRow, keepsRule } from "@/lib/cleanup/preview/impact"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import type { RuleThen } from "@/lib/validations/cleanup-rule"
import { type ActionId, GiB } from "@/lib/validations/cleanup-vocabulary"

const NEVER = { lastCountedAt: null, countedAt: [], viewers: [] }
const PLAYED = { lastCountedAt: daysAgo(5), countedAt: [daysAgo(5)], viewers: [] }

function movie(i: number, overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  return buildMovieItem({ key: `movie:tmdb:${i}`, titleKey: `tmdb:${i}`, title: `Title ${String(i).padStart(3, "0")}`, ids: { tmdb: i },
    ratingKey: String(1000 + i), sizeBytes: i * GiB, plays: NEVER, ...overrides })
}

function row(item: SnapshotItem, overrides: Partial<ImpactRow> = {}): ImpactRow {
  return { itemKey: item.key, level: item.level, sectionId: item.sectionId, ratingKey: item.ratingKey, title: item.title, year: item.year,
    seasonNumber: null, episodeCount: null, seasonCount: null, sizeBytes: BigInt(item.sizeBytes ?? 0), state: "leaving", ruleIds: ["rule-1"],
    action: "movie.unmonitorDeleteFiles", importListExclusion: false, ...overrides }
}

const THEN: RuleThen = { graceDays: 30, action: "movie.unmonitorDeleteFiles", importListExclusion: false }

function impact(items: readonly SnapshotItem[], rows: ImpactRow[], draft: RuleDraft, extra: Partial<ImpactInput> = {}) {
  const compiled = compileDraft(draft)
  const ctx = realContext()
  const results: ItemResult[] = evaluateRule(compiled, items, ctx)
  const evaluated = new Map(results.map((result) => [result.item.key, { result, classification: classify(result) }]))
  const then: RuleThen = { ...THEN, ...draft.then }
  return draftImpact({
    rule: { id: "rule-1", mode: "reviewFirst", createdAt: new Date(NOW), then },
    compiled, evaluated, byKey: new Map(items.map((i) => [i.key, i])), rows, rowKeys: new Set(rows.map((r) => r.itemKey)),
    liveRules: new Map(), blocked: false, today: "2026-11-08", holdUntil: null, ...extra,
  })
}

const NEVER_PLAYED = buildCondition("watch.lastPlayed", { op: "never" })
const draftWith = (then: Partial<RuleThen>, libraries = ["1"]) => buildDraft({ libraries, conditions: [NEVER_PLAYED], then })

describe("draftImpact actionChange", () => {
  const items = [movie(1), movie(2), movie(3)]
  const rows = items.map((i) => row(i))

  it("counts every held item when an unmonitor action becomes a delete with the exclusion", () => {
    const result = impact(items, rows, draftWith({ action: "movie.delete", importListExclusion: true }))
    expect(result).toMatchObject({ leave: 0, join: 0, keep: 3, actionChange: 3 })
    expect(result.items.map((i) => [i.itemKey, i.change])).toEqual([["movie:tmdb:3", "actionChange"], ["movie:tmdb:2", "actionChange"], ["movie:tmdb:1", "actionChange"]])
  })

  it("counts none for a more careful action, and counts the exclusion turning on alone", () => {
    const deleting = rows.map((r) => ({ ...r, action: "movie.delete" as ActionId }))
    expect(impact(items, deleting, draftWith({ action: "movie.unmonitorDeleteFiles" })).actionChange).toBe(0)
    expect(impact(items, deleting, draftWith({ action: "movie.delete", importListExclusion: false })).actionChange).toBe(0)
    expect(impact(items, deleting, draftWith({ action: "movie.delete", importListExclusion: true })).actionChange).toBe(3)
  })

  it("counts an action change with no match change", () => {
    const result = impact(items, rows, draftWith({ action: "movie.delete", importListExclusion: false }))
    expect(result).toMatchObject({ leave: 0, join: 0, actionChange: 3 })
  })

  it("merges with the other live rules that hold the item", () => {
    const other: HoldingRule = { id: "rule-2", mode: "automatic", createdAt: new Date(NOW - 1000), then: { ...THEN, action: "movie.delete" } }
    const shared = [row(items[0], { ruleIds: ["rule-1", "rule-2"] })]
    const dropped = impact(items, shared, buildDraft({ conditions: [buildCondition("watch.plays", { op: "atLeast", value: { count: 1, window: { kind: "total" } } })], then: THEN }),
      { liveRules: new Map([["rule-2", other]]) })
    expect(dropped).toMatchObject({ leave: 0, keep: 1, actionChange: 1 })
  })
})

describe("draftImpact leave, join and keep", () => {
  it("counts the items of a removed library as leaving, and the others keep their date", () => {
    const kept = [movie(1), movie(2)]
    const removed = [movie(3, { sectionId: "3" }), movie(4, { sectionId: "3" })]
    const rows = [...kept, ...removed].map((i) => row(i, { action: "movie.delete", importListExclusion: true }))
    const result = impact([...kept, ...removed], rows, draftWith({ action: "movie.delete", importListExclusion: true }))
    expect(result).toMatchObject({ leave: 2, keep: 2, join: 0, actionChange: 0 })
    expect(result.items.map((i) => [i.itemKey, i.change])).toEqual([["movie:tmdb:4", "leave"], ["movie:tmdb:3", "leave"]])
  })

  it("lets a title that no longer matches leave, keeps an unknown verdict, and lists a change for each group", () => {
    const items = [movie(1), movie(2, { plays: PLAYED }), movie(3, { plays: null }), movie(4), movie(5)]
    const rows = [row(items[0]), row(items[1]), row(items[2]), row(items[3], { state: "held" })]
    const result = impact(items, rows, draftWith({ action: "movie.delete", importListExclusion: true }))
    expect(result).toMatchObject({ leave: 1, keep: 2, join: 1, actionChange: 2, joinLeaveOn: "2026-12-08" })
    expect(result.items.map((i) => [i.itemKey, i.change])).toEqual([
      ["movie:tmdb:3", "actionChange"], ["movie:tmdb:1", "actionChange"], ["movie:tmdb:2", "leave"], ["movie:tmdb:5", "join"],
    ])
  })

  it("keeps a title on every check while the draft has blocks, but still drops one outside the scope", () => {
    const items = [movie(1, { plays: PLAYED }), movie(2, { sectionId: "3" })]
    const result = impact(items, items.map((i) => row(i)), draftWith({}), { blocked: true })
    expect(result).toMatchObject({ leave: 1, keep: 1 })
  })

  it("keeps a row whose title is not in the snapshot, and reads its scope from the row", () => {
    const gone = movie(9)
    const result = impact([], [row(gone), row(movie(8), { sectionId: "3", sizeBytes: 5 })], draftWith({}))
    expect(result).toMatchObject({ leave: 1, keep: 1 })
    expect(result.items[0]).toMatchObject({ itemKey: "movie:tmdb:8", sizeBytes: "5", posterKey: "1008", change: "leave" })
  })

  it("holds all 5 action changes and the 50 largest of 60 leaving titles (ux-a11y-r5-6)", () => {
    const leaving = Array.from({ length: 60 }, (_, i) => movie(100 + i, { plays: PLAYED }))
    const changing = Array.from({ length: 5 }, (_, i) => movie(10 + i))
    const rows = [...leaving.map((i) => row(i, { action: "movie.delete" })), ...changing.map((i) => row(i))]
    const result = impact([...leaving, ...changing], rows, draftWith({ action: "movie.delete" }))
    expect(result).toMatchObject({ leave: 60, actionChange: 5, join: 0 })
    expect(result.items.filter((i) => i.change === "actionChange")).toHaveLength(5)
    const leaves = result.items.filter((i) => i.change === "leave")
    expect(leaves).toHaveLength(50)
    expect(leaves[0].itemKey).toBe("movie:tmdb:159")
    expect(leaves.at(-1)?.itemKey).toBe("movie:tmdb:110")
  })
})

describe("keepsRule", () => {
  const base = { item: movie(1), clauses: [{ id: "c1", verdict: "pass" as const }], members: {}, protections: [], match: { state: "matched" as const } }

  it.each<[string, Partial<ItemResult>, boolean]>([
    ["a match", {}, true],
    ["a protection that protects", { protections: [{ id: "g4", verdict: "protects" }] }, false],
    ["a failed clause", { clauses: [{ id: "c1", verdict: "fail" }] }, false],
    ["an unknown clause", { clauses: [{ id: "c1", verdict: "unknown" }] }, true],
    ["an unknown protection", { protections: [{ id: "g4", verdict: "unknown" }] }, true],
    ["an unknown match", { match: { state: "unknown" } }, true],
    ["an unmatched title", { match: { state: "unmatched" } }, false],
    ["a title outside the arr paths", { match: { state: "notManaged" } }, false],
  ])("%s", (_name, overrides, keeps) => {
    expect(keepsRule({ ...base, ...overrides })).toBe(keeps)
  })
})
