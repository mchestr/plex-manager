/** Rule statistics (TS 6.4, UX 4.3.6): order-free counts, tab totals, held back and protection counts. */

import {
  buildCondition,
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  globalsOf,
  stubEvals,
  stubGlobal,
  type VerdictTable,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { nearMisses } from "@/lib/cleanup/engine/near-miss"
import { ruleStats } from "@/lib/cleanup/engine/stats"
import type { EvalContext, ItemResult, ProtectionState, Verdict } from "@/lib/cleanup/engine/types"
import type { MatchState, SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

/** A small seeded generator (mulberry32), so every run sees the same random cases. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)]
function shuffle<T>(next: () => number, list: readonly T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const c1 = buildCondition("watch.lastPlayed")
const c2 = buildCondition("watch.plays", { id: "c2" })
const c3 = buildCondition("request.exists", { id: "c3" })
const c4 = buildCondition("request.age", { id: "c4" })
const c5 = buildCondition("file.size", { id: "c5" })
const p1 = buildCondition("library.added", { id: "p1", op: "lessThan", value: { duration: { amount: 30, unit: "days" } } })
const p2 = buildCondition("watch.plays", { id: "p2", op: "atLeast", value: { count: 5, window: { kind: "total" } } })
const CLAUSES: RuleDefinition["conditions"] = [c1, c2, { id: "a1", kind: "anyOf", conditions: [c3, c4] }, c5]

/** Random verdicts, match states, sizes and global states over `count` movies. */
function randomLibrary(seed: number, count: number): { items: SnapshotItem[]; ctx: EvalContext } {
  const next = random(seed)
  const verdicts: Verdict[] = ["pass", "pass", "pass", "pass", "pass", "pass", "fail", "unknown"]
  const guards: Verdict[] = ["fail", "fail", "fail", "fail", "fail", "fail", "pass", "unknown"] // a rule protection protects on pass
  const matches: MatchState[] = ["matched", "matched", "matched", "matched", "unmatched", "unknown"]
  const states: ProtectionState[] = ["clear", "clear", "clear", "clear", "protects", "unknown"]
  const table: VerdictTable = {}
  const g4: Record<string, ProtectionState> = {}
  const items = Array.from({ length: count }, (_, i) => {
    const key = `movie:tmdb:${i + 1}`
    table[key] = Object.fromEntries(["c1", "c2", "c3", "c4", "c5", "p1", "p2"].map((id) => [id, pick(next, id.startsWith("p") ? guards : verdicts)]))
    g4[key] = pick(next, states)
    const state = pick(next, matches)
    return buildMovieItem({ key, title: `Title ${i + 1}`, sizeBytes: next() < 0.1 ? null : Math.round(next() * 40 * GiB),
      match: state === "unmatched" ? { state, cause: "noArrRecord" } : { state } })
  })
  return { items, ctx: buildEvalContext({ evals: stubEvals(table), globals: globalsOf([stubGlobal("g4", g4)]) }) }
}

describe("ruleStats", () => {
  it("gives equal statistics for the same rule with its clauses and protections in any order", () => {
    const { items, ctx } = randomLibrary(7, 200)
    const base = compileDefinition(buildDefinition({ conditions: CLAUSES, protections: [p1, p2] }))
    const expected = ruleStats(base, evaluateRule(base, items, ctx))
    expect(expected.checked).toBe(200)
    expect(expected.matches).toBeGreaterThan(0)
    expect(expected.tabs.nearMisses).toBeGreaterThan(0)
    const next = random(11)
    for (let round = 0; round < 25; round += 1) {
      const order = compileDefinition(buildDefinition({ conditions: shuffle(next, CLAUSES), protections: shuffle(next, [p1, p2]) }))
      expect(ruleStats(order, evaluateRule(order, items, ctx))).toEqual(expected)
    }
  })

  it.each([1, 2, 3, 4, 5])("adds the five tabs and not listed up to checked (seed %i)", (seed) => {
    const { items, ctx } = randomLibrary(seed, 120)
    const compiled = compileDefinition(buildDefinition({ conditions: CLAUSES, protections: [p1] }))
    const stats = ruleStats(compiled, evaluateRule(compiled, items, ctx))
    const tabs = Object.values(stats.tabs).reduce((sum, n) => sum + n, 0)
    expect(tabs + stats.notListed).toBe(stats.checked)
    expect(stats.matches).toBe(stats.tabs.matches)
    expect(stats.protectedAll).toBe(stats.tabs.protected)
  })

  it.each([1, 2, 3])("gives held back equal to the near-miss chip counts (seed %i)", (seed) => {
    const { items, ctx } = randomLibrary(seed, 150)
    const compiled = compileDefinition(buildDefinition({ conditions: CLAUSES }))
    const results = evaluateRule(compiled, items, ctx)
    const stats = ruleStats(compiled, results)
    const chips: Record<string, number> = { c1: 0, c2: 0, a1: 0, c5: 0 }
    for (const miss of nearMisses(compiled, results, ctx)) chips[miss.failing] += 1
    expect(stats.heldBack).toEqual(chips)
    expect(Object.values(chips).reduce((sum, n) => sum + n, 0)).toBe(stats.tabs.nearMisses)
  })

  it("counts pass alone, all conditions, matches, bytes and protections", () => {
    const items = [
      buildMovieItem({ key: "m:1", sizeBytes: 10 * GiB }), // match
      buildMovieItem({ key: "m:2", sizeBytes: null }), // match, unknown size
      buildMovieItem({ key: "m:3" }), // near miss on c2
      buildMovieItem({ key: "m:4" }), // protected by g4 and p1
      buildMovieItem({ key: "m:5" }), // protected by p1 only
      buildMovieItem({ key: "m:6", match: { state: "unmatched", cause: "noIds" } }), // cannot delete
      buildMovieItem({ key: "m:7" }), // missing: c1 unknown
      buildMovieItem({ key: "m:8" }), // not listed: two fails
    ]
    // Rule protections pass by default in the stub, so each row pins them
    const row = (extra: Record<string, Verdict> = {}): Record<string, Verdict> => ({ p1: "fail", p2: "fail", ...extra })
    const table: VerdictTable = {
      "m:1": row(), "m:2": row(), "m:3": row({ c2: "fail" }), "m:4": row({ p1: "pass" }), "m:5": row({ p1: "pass" }),
      "m:6": row(), "m:7": row({ c1: "unknown" }), "m:8": row({ c1: "fail", c2: "fail" }),
    }
    const ctx = buildEvalContext({ evals: stubEvals(table), globals: globalsOf([stubGlobal("g4", { "m:4": "protects" })]) })
    const compiled = compileDefinition(buildDefinition({ conditions: [c1, c2], protections: [p1, p2] }))
    const results = evaluateRule(compiled, items, ctx)
    expect(results.map((r) => classify(r).class)).toEqual(["match", "match", "nearMiss", "protected", "protected", "cannotDelete", "missing", "notListed"])
    expect(ruleStats(compiled, results)).toEqual({
      checked: 8,
      passAlone: { c1: 6, c2: 6 },
      heldBack: { c1: 0, c2: 1 },
      allConditions: 5,
      protectedAll: 2,
      // m:4 has the global g4 and the rule protection p1; m:5 has only p1
      protectedGlobal: 1,
      matches: 2,
      bytes: 10 * GiB,
      tabs: { matches: 2, nearMisses: 1, protected: 2, missing: 1, cannotDelete: 1 },
      notListed: 1,
      protectedBy: { g4: 1, p1: 2 },
      keepsSafe: { p1: 2, p2: 0 },
    })
  })

  it("takes the classes that the caller already has", () => {
    const compiled = compileDefinition(buildDefinition())
    const results = evaluateRule(compiled, [buildMovieItem()], buildEvalContext())
    expect(ruleStats(compiled, results, [{ class: "missing" }]).tabs).toEqual({ matches: 0, nearMisses: 0, protected: 0, missing: 1, cannotDelete: 0 })
  })

  it("counts a clause id that the compiled rule does not name, and skips a near miss with no failing id", () => {
    const compiled = compileDefinition(buildDefinition())
    const stale: ItemResult = { item: buildMovieItem(), clauses: [{ id: "c7", verdict: "pass" }], members: {}, protections: [], match: { state: "matched" } }
    const stats = ruleStats(compiled, [stale, stale], [{ class: "nearMiss", failing: "c8" }, { class: "nearMiss" }])
    expect(stats.passAlone).toEqual({ c1: 0, c7: 2 })
    expect(stats.heldBack).toEqual({ c1: 0, c8: 1 })
    expect(stats.tabs.nearMisses).toBe(2)
  })

  it("gives zeros for no items, with every clause and rule protection named", () => {
    const compiled = compileDefinition(buildDefinition({ conditions: CLAUSES, protections: [p1] }))
    const stats = ruleStats(compiled, [])
    expect(stats).toMatchObject({ checked: 0, matches: 0, bytes: 0, notListed: 0, protectedBy: {}, keepsSafe: { p1: 0 } })
    expect(Object.keys(stats.passAlone)).toEqual(["c1", "c2", "a1", "c5"])
  })
})
