/** Kleene logic (TS 6.2): the full 3 x 3 tables, the folds over a set, and the stub evaluators that the engine tests share. */

import {
  buildCondition,
  buildEvalContext,
  buildMovieItem,
  buildSeasonItem,
  globalsOf,
  stubEvals,
  stubFieldEval,
  stubGlobal,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { all, and, any, none, not, or } from "@/lib/cleanup/engine/kleene"
import type { Verdict } from "@/lib/cleanup/engine/types"
import { FIELD_IDS } from "@/lib/validations/cleanup-vocabulary"

const AND: [Verdict, Verdict, Verdict][] = [
  ["pass", "pass", "pass"],
  ["pass", "fail", "fail"],
  ["pass", "unknown", "unknown"],
  ["fail", "pass", "fail"],
  ["fail", "fail", "fail"],
  ["fail", "unknown", "fail"],
  ["unknown", "pass", "unknown"],
  ["unknown", "fail", "fail"],
  ["unknown", "unknown", "unknown"],
]

const OR: [Verdict, Verdict, Verdict][] = [
  ["pass", "pass", "pass"],
  ["pass", "fail", "pass"],
  ["pass", "unknown", "pass"],
  ["fail", "pass", "pass"],
  ["fail", "fail", "fail"],
  ["fail", "unknown", "unknown"],
  ["unknown", "pass", "pass"],
  ["unknown", "fail", "unknown"],
  ["unknown", "unknown", "unknown"],
]

describe("and", () => {
  it.each(AND)("%s and %s is %s", (a, b, result) => {
    expect(and(a, b)).toBe(result)
  })
})

describe("or", () => {
  it.each(OR)("%s or %s is %s", (a, b, result) => {
    expect(or(a, b)).toBe(result)
  })
})

describe("not", () => {
  it.each([
    ["pass", "fail"],
    ["fail", "pass"],
    ["unknown", "unknown"],
  ] as const)("not %s is %s", (a, result) => {
    expect(not(a)).toBe(result)
  })
})

describe("folds over a set", () => {
  it.each([
    [[], "pass", "fail", "pass"],
    [["pass"], "pass", "pass", "fail"],
    [["pass", "unknown"], "unknown", "pass", "fail"],
    [["fail", "unknown"], "fail", "unknown", "unknown"],
    [["fail", "fail"], "fail", "fail", "pass"],
    [["unknown", "unknown", "pass"], "unknown", "pass", "fail"],
  ] as [Verdict[], Verdict, Verdict, Verdict][])("%j: all %s, any %s, none %s", (verdicts, allOf, anyOf, noneOf) => {
    expect(all(verdicts)).toBe(allOf)
    expect(any(verdicts)).toBe(anyOf)
    expect(none(verdicts)).toBe(noneOf)
  })

  it("does not depend on the order", () => {
    const set: Verdict[] = ["unknown", "pass", "fail"]
    expect(all(set)).toBe(all([...set].reverse()))
    expect(any(set)).toBe(any([...set].reverse()))
  })
})

describe("stub evaluators (builders)", () => {
  const movie = buildMovieItem()
  const ctx = buildEvalContext()

  it("give one stub for each field, passing by default", () => {
    const evals = stubEvals()
    expect(Object.keys(evals)).toEqual([...FIELD_IDS])
    const c = buildCondition("file.size")
    expect(evals["file.size"].evaluate(movie, c, ctx, "condition")).toEqual({ verdict: "pass" })
    expect(evals["file.size"].fact(movie, ctx)).toEqual([{ text: "file.size fact." }])
    expect([evals["file.size"].gap?.(movie, c, ctx), evals["file.size"].forecast?.(movie, c, ctx)]).toEqual([null, null])
    expect([evals["file.size"].tryValue?.(movie, c, ctx), evals["file.size"].measure?.(movie, ctx)]).toEqual([null, null])
  })

  it("read verdicts by item key and condition id, and fold with Kleene logic", () => {
    const evals = stubEvals({ [movie.key]: { c1: "fail", c2: { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } } } }, "unknown")
    const verdicts = ["c1", "c2", "c3"].map((id) => evals["watch.lastPlayed"].evaluate(movie, buildCondition("watch.lastPlayed", { id }), ctx, "condition"))
    expect(verdicts).toEqual([{ verdict: "fail" }, { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }, { verdict: "unknown" }])
    expect(all(verdicts.map((v) => v.verdict))).toBe("fail")
    expect(any(verdicts.map((v) => v.verdict))).toBe("unknown")
  })

  it("take a replacement for one field", () => {
    const custom = stubFieldEval("show.status", {}, "fail")
    expect(stubEvals({}, "pass", { "show.status": custom })["show.status"]).toBe(custom)
  })

  it("give global protections by level", () => {
    const season = buildSeasonItem()
    const g4 = stubGlobal("g4", { [movie.key]: "protects", [season.key]: { verdict: "unknown", cause: { kind: "noValue", what: "history" } } })
    const g11 = stubGlobal("g11", {}, "clear", ["season"])
    const context = buildEvalContext({ globals: globalsOf([g4, g11]) })
    expect(context.globals("movie").map((g) => g.id)).toEqual(["g4"])
    expect(context.globals("season").map((g) => g.id)).toEqual(["g4", "g11"])
    expect(g4.evaluate(movie, context)).toEqual({ verdict: "protects" })
    expect(g4.evaluate(season, context)).toEqual({ verdict: "unknown", cause: { kind: "noValue", what: "history" } })
    expect(g11.evaluate(season, context)).toEqual({ verdict: "clear" })
    expect(g4.fact?.(movie, context)).toEqual([{ text: "g4 fact." }])
    expect(ctx.globals("movie")).toEqual([])
  })
})
