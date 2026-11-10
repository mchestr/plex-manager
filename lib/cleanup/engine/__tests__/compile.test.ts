/** Compile (TS 3.2, TS 6.1): incomplete conditions, groups with 0, 1 and 2 complete conditions, and stored definitions. */

import {
  buildCondition,
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  stubEvals,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition, compileDraft, findCondition, replaceCondition } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { ruleStats } from "@/lib/cleanup/engine/stats"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

function buildDraft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    schemaVersion: 1,
    level: "movie",
    libraries: ["1"],
    conditions: [buildCondition("watch.lastPlayed")],
    protections: [],
    then: { graceDays: 30 },
    ...overrides,
  }
}

const sizeMissing: DraftCondition = { id: "c2", field: "file.size", op: "moreThan", value: { unit: "GB" } }
const badOp: DraftCondition = { id: "c3", field: "watch.plays", op: "sometimes", value: { count: 1, window: { kind: "total" } } }
const plays = buildCondition("watch.plays", { id: "c4" })
const added = buildCondition("library.added", { id: "c5" })

describe("compileDraft", () => {
  it("keeps complete conditions and the scope, and copies the partial Then", () => {
    const compiled = compileDraft(buildDraft({ libraries: ["1", "3"] }))
    expect(compiled.scope).toEqual({ level: "movie", libraries: ["1", "3"] })
    expect(compiled.clauses).toEqual([{ kind: "condition", id: "c1", condition: buildCondition("watch.lastPlayed") }])
    expect(compiled.incomplete).toEqual([])
    expect(compiled.then).toEqual({ graceDays: 30 })
  })

  it("leaves out a condition that fails conditionSchema and names it incomplete", () => {
    const compiled = compileDraft(buildDraft({ conditions: [buildCondition("watch.lastPlayed"), sizeMissing, badOp] }))
    expect(compiled.clauses.map((c) => c.id)).toEqual(["c1"])
    expect(compiled.incomplete).toEqual(["c2", "c3"])
  })

  it("leaves out a group with no complete condition", () => {
    const compiled = compileDraft(buildDraft({ conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [sizeMissing, badOp] }] }))
    expect(compiled.clauses.map((c) => c.id)).toEqual(["c1"])
    expect(compiled.incomplete).toEqual(["c2", "c3"])
  })

  it("leaves out an empty group and names nothing incomplete", () => {
    const compiled = compileDraft(buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [] }] }))
    expect(compiled.clauses).toEqual([])
    expect(compiled.incomplete).toEqual([])
  })

  it("keeps a group with one complete condition under the group id, holding that condition", () => {
    const compiled = compileDraft(buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [plays, sizeMissing] }] }))
    expect(compiled.clauses).toEqual([{ kind: "group", id: "a1", conditions: [plays] }])
    expect(compiled.incomplete).toEqual(["c2"])
  })

  it("keeps a group with two complete conditions", () => {
    const compiled = compileDraft(buildDraft({ conditions: [{ id: "a1", kind: "anyOf", conditions: [plays, added] }] }))
    expect(compiled.clauses).toEqual([{ kind: "group", id: "a1", conditions: [plays, added] }])
  })

  it("leaves out an incomplete rule protection", () => {
    const protection = buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 3, window: { kind: "total" } } })
    const compiled = compileDraft(buildDraft({ protections: [protection, { id: "p2", field: "file.size", op: "lessThan", value: null }] }))
    expect(compiled.protections).toEqual([protection])
    expect(compiled.incomplete).toEqual(["p2"])
  })

  it("does not share the draft's arrays", () => {
    const draft = buildDraft()
    const compiled = compileDraft(draft)
    draft.libraries.push("7")
    expect(compiled.scope.libraries).toEqual(["1"])
  })

  it("gives the same result with and without an incomplete condition", () => {
    const items = [buildMovieItem(), buildMovieItem({ key: "movie:tmdb:2", sizeBytes: 3 * GiB })]
    const ctx = buildEvalContext({ evals: stubEvals({ "movie:tmdb:2": { c1: "fail" } }) })
    const complete = compileDraft(buildDraft())
    const withIncomplete = compileDraft(buildDraft({ conditions: [buildCondition("watch.lastPlayed"), sizeMissing] }))
    const a = evaluateRule(complete, items, ctx)
    const b = evaluateRule(withIncomplete, items, ctx)
    expect(b).toEqual(a)
    expect(ruleStats(withIncomplete, b)).toEqual(ruleStats(complete, a))
  })
})

describe("compileDefinition", () => {
  it("keeps conditions, groups, protections, the scope and the Then, with nothing incomplete", () => {
    const protection = buildCondition("file.size", { id: "p1", op: "lessThan", value: { bytes: 2 * GiB, unit: "GB" } })
    const def = buildDefinition({
      libraries: ["1", "2"],
      conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [plays, added] }],
      protections: [protection],
    })
    expect(compileDefinition(def)).toEqual({
      scope: { level: "movie", libraries: ["1", "2"] },
      clauses: [
        { kind: "condition", id: "c1", condition: buildCondition("watch.lastPlayed") },
        { kind: "group", id: "a1", conditions: [plays, added] },
      ],
      protections: [protection],
      incomplete: [],
      then: def.then,
    })
  })
})

describe("findCondition and replaceCondition", () => {
  const protection = buildCondition("file.size", { id: "p1", op: "lessThan", value: { bytes: 2 * GiB, unit: "GB" } })
  const compiled = compileDefinition(
    buildDefinition({ conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [plays, added] }], protections: [protection] }),
  )

  it.each([
    ["a top-level condition", "c1", buildCondition("watch.lastPlayed")],
    ["a group member", "c5", added],
    ["a rule protection", "p1", protection],
    ["no such id", "c9", null],
    ["a group id", "a1", null],
  ])("finds %s", (_name, id, expected) => {
    expect(findCondition(compiled, id)).toEqual(expected)
  })

  it("replaces a condition anywhere and leaves the others", () => {
    const top = buildCondition("watch.lastPlayed", { value: { duration: { amount: 2, unit: "years" }, orNever: false } })
    const member = buildCondition("library.added", { id: "c5", value: { duration: { amount: 10, unit: "days" } } })
    const guard = buildCondition("file.size", { id: "p1", op: "lessThan", value: { bytes: 5 * GiB, unit: "GB" } })
    const next = [top, member, guard].reduce(replaceCondition, compiled)
    expect(findCondition(next, "c1")).toEqual(top)
    expect(findCondition(next, "c5")).toEqual(member)
    expect(findCondition(next, "c4")).toEqual(plays)
    expect(findCondition(next, "p1")).toEqual(guard)
    expect(findCondition(compiled, "c1")).toEqual(buildCondition("watch.lastPlayed"))
  })
})
