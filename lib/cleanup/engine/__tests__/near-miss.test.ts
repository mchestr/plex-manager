/** Near misses (TS 6.5): the closeness sort, the dispatch of gap, forecast and try value through ctx.evals, and the Try effect. */

import {
  buildCondition,
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  stubEvals,
  stubFieldEval,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition, compileDraft } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import {
  byCloseness,
  matchTotals,
  type NearMiss,
  nearMisses,
  nearMissForecast,
  nearMissGap,
  nearMissTryValue,
  tryValueEffect,
} from "@/lib/cleanup/engine/near-miss"
import type { CompiledRule, EvalContext, FieldEval, ItemResult } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

/** A size field that really reads the value: more than or less than the threshold, with a gap in GB and a try value. */
const sizeEval: FieldEval<"file.size"> = {
  ...stubFieldEval("file.size"),
  evaluate: (item, c) => {
    if (item.sizeBytes === null) return { verdict: "unknown", cause: { kind: "noValue", what: "size" } }
    const passes = c.op === "moreThan" ? item.sizeBytes > c.value.bytes : item.sizeBytes < c.value.bytes
    return { verdict: passes ? "pass" : "fail" }
  },
  gap: (item, c) => (item.sizeBytes === null ? null : Math.abs(c.value.bytes - item.sizeBytes) / GiB),
  forecast: () => null,
  tryValue: (item, c) => (item.sizeBytes === null ? null : { bytes: Math.max(GiB, Math.floor(item.sizeBytes / GiB) * GiB - GiB), unit: c.value.unit }),
}

/** A last-played field that gives a fixed forecast and a try value that does not parse. */
const playedEval: FieldEval<"watch.lastPlayed"> = {
  ...stubFieldEval("watch.lastPlayed"),
  gap: () => 4,
  forecast: (item) => (item.key === "m:3" ? "2026-12-01" : null),
  tryValue: () => ({ duration: { amount: 0, unit: "days" }, orNever: true }),
}

const size = buildCondition("file.size", { id: "c2", value: { bytes: 20 * GiB, unit: "GB" } })
const plays = buildCondition("watch.plays", { id: "c3" })
const added = buildCondition("library.added", { id: "c4" })

function context(overrides: Partial<EvalContext> = {}): EvalContext {
  return buildEvalContext({ evals: stubEvals({}, "pass", { "file.size": sizeEval, "watch.lastPlayed": playedEval }), ...overrides })
}

const sized = (key: string, gib: number | null, title = key) => buildMovieItem({ key, title, sizeBytes: gib === null ? null : gib * GiB })
const resultOf = (compiled: CompiledRule, item: SnapshotItem, ctx: EvalContext): ItemResult => evaluateRule(compiled, [item], ctx)[0]

describe("dispatch through ctx.evals", () => {
  const ctx = context()
  const rule = compileDefinition(buildDefinition({ conditions: [buildCondition("watch.lastPlayed"), size, { id: "a1", kind: "anyOf", conditions: [plays, added] }] }))
  const small = resultOf(rule, sized("m:1", 15), ctx)

  it("asks the failing condition's field for its gap", () => {
    expect(nearMissGap(rule, small, "c2", ctx)).toBe(5)
    expect(nearMissGap(rule, small, "c1", ctx)).toBe(4)
  })

  it("gives no gap, forecast or try value for a group of two, or an id that names no clause", () => {
    for (const id of ["a1", "c9", "c3"]) {
      expect(nearMissGap(rule, small, id, ctx)).toBeNull()
      expect(nearMissForecast(rule, small, id, ctx)).toBeNull()
      expect(nearMissTryValue(rule, small, id, ctx)).toBeNull()
    }
  })

  it("gives null when the field has no such function, or the field gives null", () => {
    const bare: FieldEval<"watch.plays"> = { id: "watch.plays", evaluate: () => ({ verdict: "fail" }), fact: () => [] }
    const withPlays = compileDefinition(buildDefinition({ conditions: [plays] }))
    const noFns = context({ evals: stubEvals({}, "pass", { "watch.plays": bare }) })
    const r = resultOf(withPlays, sized("m:1", 1), noFns)
    expect(nearMissGap(withPlays, r, "c3", noFns)).toBeNull()
    expect(nearMissForecast(withPlays, r, "c3", noFns)).toBeNull()
    expect(nearMissTryValue(withPlays, r, "c3", noFns)).toBeNull()
    expect(nearMissTryValue(rule, resultOf(rule, sized("m:1", null), ctx), "c2", ctx)).toBeNull()
  })

  it("a draft group with one complete condition answers as that condition", () => {
    const draft = compileDraft({
      schemaVersion: 1, level: "movie", libraries: ["1"], protections: [], then: {},
      conditions: [{ id: "a1", kind: "anyOf", conditions: [size, { id: "c9", field: "file.size", op: "moreThan", value: null }] }],
    })
    const r = resultOf(draft, sized("m:1", 15), ctx)
    expect(nearMissGap(draft, r, "a1", ctx)).toBe(5)
    expect(nearMissTryValue(draft, r, "a1", ctx)).toEqual({ ...size, value: { bytes: 14 * GiB, unit: "GB" } })
  })

  it("asks for the forecast of the failing condition", () => {
    expect(nearMissForecast(rule, resultOf(rule, sized("m:3", 1), ctx), "c1", ctx)).toBe("2026-12-01")
    expect(nearMissForecast(rule, small, "c1", ctx)).toBeNull()
    expect(nearMissForecast(rule, small, "c2", ctx)).toBeNull()
  })

  it("gives the condition with its try value, and null for a value that does not parse", () => {
    expect(nearMissTryValue(rule, small, "c2", ctx)).toEqual({ ...size, value: { bytes: 14 * GiB, unit: "GB" } })
    expect(nearMissTryValue(rule, small, "c1", ctx)).toBeNull()
  })
})

describe("nearMisses and byCloseness", () => {
  it("lists only near misses, closest first, then no gap, with ties by title and key", () => {
    const ctx = context()
    const rule = compileDefinition(buildDefinition({ conditions: [size] }))
    const items = [
      sized("m:1", 11, "Delta"), // gap 9
      sized("m:2", 25, "Echo"), // a match
      sized("m:3", 18, "Bravo"), // gap 2
      sized("m:4", null, "Alpha"), // unknown: missing data
      sized("m:5", 18, "Alpha"), // gap 2, sorts before Bravo
      sized("m:7", 18, "Alpha"), // gap 2, same title: by key
    ]
    const list = nearMisses(rule, evaluateRule(rule, items, ctx), ctx)
    expect(list.map((m) => [m.result.item.key, m.failing, m.gap])).toEqual([
      ["m:5", "c2", 2],
      ["m:7", "c2", 2],
      ["m:3", "c2", 2],
      ["m:1", "c2", 9],
    ])
  })

  it("sorts a null gap after every number", () => {
    const at = (key: string, gap: number | null, title: string): NearMiss => ({ result: { item: buildMovieItem({ key, title }), clauses: [], members: {}, protections: [], match: { state: "matched" } }, failing: "a1", gap })
    const list = [at("m:1", null, "Alpha"), at("m:2", 30, "Zulu"), at("m:3", null, "Bravo"), at("m:4", 0, "Yankee")].sort(byCloseness)
    expect(list.map((m) => m.result.item.key)).toEqual(["m:4", "m:2", "m:1", "m:3"])
  })

  it("compares two near misses in both directions", () => {
    const at = (gap: number | null, title: string): NearMiss => ({ result: { item: buildMovieItem({ title }), clauses: [], members: {}, protections: [], match: { state: "matched" } }, failing: "c1", gap })
    expect(byCloseness(at(null, "A"), at(3, "B"))).toBe(1)
    expect(byCloseness(at(3, "B"), at(null, "A"))).toBe(-1)
    expect(byCloseness(at(1, "B"), at(3, "A"))).toBeLessThan(0)
    expect(byCloseness(at(2, "A"), at(2, "B"))).toBeLessThan(0)
    expect(byCloseness(at(2, "A"), at(2, "A"))).toBe(0)
  })

  it("takes the classes that the caller already has, and skips a near miss with no failing id", () => {
    const ctx = context()
    const rule = compileDefinition(buildDefinition({ conditions: [size] }))
    const results = evaluateRule(rule, [sized("m:1", 25), sized("m:2", 25)], ctx)
    expect(nearMisses(rule, results, ctx, [{ class: "nearMiss", failing: "c2" }, { class: "nearMiss" }]).map((m) => m.result.item.key)).toEqual(["m:1"])
  })
})

describe("matchTotals and tryValueEffect", () => {
  const ctx = context()
  const rule = compileDefinition(buildDefinition({ conditions: [size] }))
  const items = [sized("m:1", 25), sized("m:2", 15), sized("m:3", 12), sized("m:4", 30), sized("m:5", null), buildMovieItem({ key: "m:6", sectionId: "9", sizeBytes: 99 * GiB })]

  it("counts the matches of the covered items and their bytes", () => {
    expect(matchTotals(rule, items, ctx)).toEqual({ matches: 2, bytes: 55 * GiB })
  })

  it("counts an unknown size as 0 bytes", () => {
    const any = compileDefinition(buildDefinition())
    expect(matchTotals(any, [sized("m:1", null), sized("m:2", 3)], ctx)).toEqual({ matches: 2, bytes: 3 * GiB })
  })

  it("runs the rule again with only that value changed", () => {
    expect(tryValueEffect(rule, items, ctx, { conditionId: "c2", value: { bytes: 14 * GiB, unit: "GB" } })).toEqual({ addsCount: 1, addsBytes: 15 * GiB })
    expect(tryValueEffect(rule, items, ctx, { conditionId: "c2", value: { bytes: 11 * GiB, unit: "GB" } })).toEqual({ addsCount: 2, addsBytes: 27 * GiB })
    expect(tryValueEffect(rule, items, ctx, { conditionId: "c2", value: { bytes: 28 * GiB, unit: "GB" } })).toEqual({ addsCount: -1, addsBytes: -25 * GiB })
  })

  it("uses the current totals that the caller gives", () => {
    const effect = tryValueEffect(rule, items, ctx, { conditionId: "c2", value: { bytes: 14 * GiB, unit: "GB" } }, { matches: 0, bytes: 0 })
    expect(effect).toEqual({ addsCount: 3, addsBytes: 70 * GiB })
  })

  it("matches the try value of a near miss: the item joins", () => {
    const near = evaluateRule(rule, items, ctx).find((r) => classify(r).class === "nearMiss" && r.item.key === "m:2")
    if (!near) throw new Error("no near miss")
    const tried = nearMissTryValue(rule, near, "c2", ctx)
    if (!tried) throw new Error("no try value")
    expect(tryValueEffect(rule, items, ctx, { conditionId: tried.id, value: tried.value })?.addsCount).toBeGreaterThanOrEqual(1)
  })

  it("gives null for an id that names no condition, or a value that does not parse", () => {
    expect(tryValueEffect(rule, items, ctx, { conditionId: "c9", value: { bytes: 14 * GiB, unit: "GB" } })).toBeNull()
    expect(tryValueEffect(rule, items, ctx, { conditionId: "c2", value: { bytes: 1, unit: "GB" } })).toBeNull()
  })
})
