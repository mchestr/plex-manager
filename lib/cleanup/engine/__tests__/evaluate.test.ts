/** One item and one rule (TS 6.3 steps 1 to 4): clause, group and protection verdicts through the injected evaluators (D1). */

import { readFileSync } from "fs"
import path from "path"

import {
  buildCondition,
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  buildShowItem,
  globalsOf,
  stubEvals,
  stubFieldEval,
  stubGlobal,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition, compileDraft } from "@/lib/cleanup/engine/compile"
import { conditionVerdict, evaluateItem, evaluateRule, fieldEvalOf } from "@/lib/cleanup/engine/evaluate"
import type { FieldEval, UnknownCause } from "@/lib/cleanup/engine/types"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

const tautulli: UnknownCause = { kind: "sourceFailed", service: "tautulli" }
const noDate: UnknownCause = { kind: "noValue", what: "date" }
const item = buildMovieItem()
const plays = buildCondition("watch.plays", { id: "c2" })
const added = buildCondition("library.added", { id: "c3" })
const size = buildCondition("file.size", { id: "c4" })
const keepPlayed = buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 3, window: { kind: "total" } } })

const rule = (overrides: Partial<RuleDefinition> = {}) => compileDefinition(buildDefinition(overrides))

describe("evaluateItem", () => {
  it("gives each condition its verdict and keeps the cause of an unknown only", () => {
    const compiled = rule({ conditions: [buildCondition("watch.lastPlayed"), plays, added] })
    const ctx = buildEvalContext({
      evals: stubEvals({ [item.key]: { c1: { verdict: "unknown", cause: tautulli }, c2: { verdict: "fail", cause: noDate }, c3: "pass" } }),
    })
    const result = evaluateItem(compiled, item, ctx)
    expect(result.clauses).toEqual([
      { id: "c1", verdict: "unknown", cause: tautulli },
      { id: "c2", verdict: "fail" },
      { id: "c3", verdict: "pass" },
    ])
    expect(result.members).toEqual({})
    expect(result.item).toBe(item)
    expect(result.match).toEqual(item.match)
  })

  it.each([
    ["one member passes", ["fail", "pass", "unknown"], "pass", undefined],
    ["no pass and an unknown", ["fail", "unknown", "unknown"], "unknown", tautulli],
    ["every member fails", ["fail", "fail", "fail"], "fail", undefined],
  ] as const)("a group: %s", (_name, [v2, v3, v4], verdict, cause) => {
    const compiled = rule({ conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [plays, added, size] }] })
    const unknown = { verdict: "unknown", cause: tautulli } as const
    const ctx = buildEvalContext({
      evals: stubEvals({ [item.key]: { c2: v2, c3: v3 === "unknown" ? unknown : v3, c4: v4 === "unknown" ? { verdict: "unknown", cause: noDate } : v4 } }),
    })
    const result = evaluateItem(compiled, item, ctx)
    expect(result.clauses[1]).toEqual(cause === undefined ? { id: "a1", verdict } : { id: "a1", verdict, cause })
    expect(result.members.a1.map((m) => m.verdict)).toEqual([v2, v3, v4])
    expect(result.members.a1.map((m) => m.id)).toEqual(["c2", "c3", "c4"])
  })

  it("a draft group with one complete condition gives that condition's verdict", () => {
    const compiled = compileDraft({
      schemaVersion: 1, level: "movie", libraries: ["1"], protections: [], then: {},
      conditions: [{ id: "a1", kind: "anyOf", conditions: [plays, { id: "c9", field: "file.size", op: "moreThan", value: {} }] }],
    })
    for (const verdict of ["pass", "fail", "unknown"] as const) {
      const ctx = buildEvalContext({ evals: stubEvals({ [item.key]: { c2: verdict } }) })
      expect(evaluateItem(compiled, item, ctx).clauses).toEqual([{ id: "a1", verdict }])
    }
  })

  it("evaluates conditions with role condition and rule protections with role protection", () => {
    const roles: string[] = []
    const spy: FieldEval<"watch.plays"> = {
      ...stubFieldEval("watch.plays"),
      evaluate: (_item, c, _ctx, role) => {
        roles.push(`${c.id}:${role}`)
        return { verdict: "fail" }
      },
    }
    const compiled = rule({ conditions: [plays], protections: [keepPlayed] })
    evaluateItem(compiled, item, buildEvalContext({ evals: stubEvals({}, "pass", { "watch.plays": spy }) }))
    expect(roles).toEqual(["c2:condition", "p1:protection"])
  })

  it("puts the enabled globals of the level first, then the rule protections", () => {
    const p2 = buildCondition("file.size", { id: "p2" })
    const p3 = buildCondition("library.added", { id: "p3" })
    const compiled = rule({ protections: [keepPlayed, p2, p3] })
    const ctx = buildEvalContext({
      evals: stubEvals({ [item.key]: { p1: "pass", p2: "fail", p3: { verdict: "unknown", cause: noDate } } }),
      globals: globalsOf([
        stubGlobal("g4", { [item.key]: { verdict: "unknown", cause: tautulli } }),
        stubGlobal("g11", {}, "protects", ["season"]),
        stubGlobal("g1", { [item.key]: { verdict: "protects", cause: tautulli } }),
      ]),
    })
    expect(evaluateItem(compiled, item, ctx).protections).toEqual([
      { id: "g4", verdict: "unknown", cause: tautulli },
      { id: "g1", verdict: "protects" },
      { id: "p1", verdict: "protects" },
      { id: "p2", verdict: "clear" },
      { id: "p3", verdict: "unknown", cause: noDate },
    ])
  })

  it("asks for the globals of the rule's level", () => {
    const globals = jest.fn(() => [])
    evaluateItem(rule({ level: "show", libraries: ["2"], then: { graceDays: 30, action: "show.delete", importListExclusion: false } }), buildShowItem(), buildEvalContext({ globals }))
    expect(globals).toHaveBeenCalledWith("show")
  })

  it("copies the match state with its cause", () => {
    const unmatched = buildMovieItem({ match: { state: "conflicted", cause: "twoArrRecords" } })
    expect(evaluateItem(rule(), unmatched, buildEvalContext()).match).toEqual({ state: "conflicted", cause: "twoArrRecords" })
  })
})

describe("conditionVerdict and fieldEvalOf", () => {
  it("asks the evaluator of the condition's field, with the role", () => {
    const ctx = buildEvalContext({ evals: stubEvals({ [item.key]: { c3: { verdict: "unknown", cause: noDate } } }) })
    expect(fieldEvalOf(ctx, added)).toBe(ctx.evals["library.added"])
    expect(conditionVerdict(added, item, ctx, "protection")).toEqual({ verdict: "unknown", cause: noDate })
    expect(conditionVerdict(plays, item, ctx, "condition")).toEqual({ verdict: "pass" })
  })
})

describe("evaluateRule", () => {
  const inScope = buildMovieItem({ key: "movie:tmdb:1" })
  const otherLibrary = buildMovieItem({ key: "movie:tmdb:2", sectionId: "4" })
  const otherLevel = buildShowItem({ sectionId: "1" })
  const second = buildMovieItem({ key: "movie:tmdb:3", sectionId: "3" })

  it("gives no result for an item outside the scope, and keeps the order of the others", () => {
    const compiled = rule({ libraries: ["1", "3"] })
    const results = evaluateRule(compiled, [second, otherLibrary, inScope, otherLevel], buildEvalContext())
    expect(results.map((r) => r.item.key)).toEqual(["movie:tmdb:3", "movie:tmdb:1"])
  })

  it("never calls a field for an item outside the scope", () => {
    const seen: string[] = []
    const spy: FieldEval<"watch.lastPlayed"> = {
      ...stubFieldEval("watch.lastPlayed"),
      evaluate: (it) => {
        seen.push(it.key)
        return { verdict: "pass" }
      },
    }
    evaluateRule(rule(), [otherLibrary, inScope, otherLevel], buildEvalContext({ evals: stubEvals({}, "pass", { "watch.lastPlayed": spy }) }))
    expect(seen).toEqual(["movie:tmdb:1"])
  })

  it("reads the globals once per rule, and gives each item the same result as evaluateItem", () => {
    const globals = jest.fn(globalsOf([stubGlobal("g4", { "movie:tmdb:3": "protects" })]))
    const ctx = buildEvalContext({ globals, evals: stubEvals({ "movie:tmdb:1": { c1: "fail" } }) })
    const compiled = rule({ libraries: ["1", "3"] })
    const results = evaluateRule(compiled, [inScope, second], ctx)
    expect(globals).toHaveBeenCalledTimes(1)
    expect(results).toEqual([evaluateItem(compiled, inScope, ctx), evaluateItem(compiled, second, ctx)])
  })

  it("gives nothing for no items", () => {
    expect(evaluateRule(rule(), [], buildEvalContext())).toEqual([])
  })
})

describe("the engine core imports", () => {
  const FILES = ["scope", "compile", "evaluate", "classify", "stats", "near-miss", "why"]
  // Pure, client-safe modules only (E11): no server module, no field file (D1)
  const ALLOWED = [/^@\/lib\/cleanup\/engine\/(kleene|types|scope|compile|evaluate|classify)$/, /^@\/lib\/cleanup\/schema\/(snapshot|why)$/, /^@\/lib\/validations\/cleanup-(rule|draft|actions|vocabulary)$/]

  it.each(FILES)("%s.ts imports only pure engine, schema and validation modules", (name) => {
    const source = readFileSync(path.join(process.cwd(), "lib/cleanup/engine", `${name}.ts`), "utf8")
    const specifiers = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) expect(ALLOWED.some((re) => re.test(specifier))).toBe(true)
  })
})
