/** Conditions that cancel out (TS 6.7): each of the 11 pairs, pairs that do not cancel, groups and the global protection options. */

import { buildCondition, buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import { findContradictions } from "@/lib/cleanup/engine/contradictions"
import type { CompiledRule } from "@/lib/cleanup/engine/types"
import type { Condition } from "@/lib/validations/cleanup-rule"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const options = buildOptions() // G4 30 days, G6 30 days, both on
const d = (amount: number, unit: "days" | "weeks" | "months" | "years" = "days") => ({ amount, unit })

const rule = (...conditions: Condition[]): Pick<CompiledRule, "clauses"> => ({
  clauses: conditions.map((condition) => ({ kind: "condition", id: condition.id, condition })),
})

const lastPlayed = (id: string, op: "moreThan" | "lessThan" | "never", days = 30, orNever = false) =>
  buildCondition("watch.lastPlayed", { id, op, value: { duration: d(days), orNever } })
const plays = (id: string, op: "atLeast" | "fewerThan", count: number, window: { kind: "total" } | { kind: "last"; duration: ReturnType<typeof d> } = { kind: "total" }) =>
  buildCondition("watch.plays", { id, op, value: { count, window } })
const dated = (field: "request.age" | "library.added" | "show.lastEpisodeAdded", id: string, op: "moreThan" | "lessThan", days: number, unit: "days" | "weeks" = "days") =>
  buildCondition(field, { id, op, value: { duration: d(days, unit) } })
const size = (id: string, op: "moreThan" | "lessThan", gb: number) => buildCondition("file.size", { id, op, value: { bytes: gb * GiB, unit: "GB" } })
const seasons = (id: string, op: "atLeast" | "fewerThan", count: number) => buildCondition("show.seasonsOnDisk", { id, op, value: { count } })
const position = (id: string, op: "newest" | "notNewest", count: number) => buildCondition("season.position", { id, op, value: { count } })
const exists = (id: string, value: boolean) => buildCondition("request.exists", { id, value: { exists: value } })

describe("findContradictions: the 11 pairs", () => {
  it.each<[string, Condition[]]>([
    ["1 same date field, more than and less than (watch.lastPlayed, or never)", [lastPlayed("c1", "moreThan", 365, true), lastPlayed("c2", "lessThan", 180)]],
    ["1 same date field (request.age), equal days", [dated("request.age", "c1", "moreThan", 90), dated("request.age", "c2", "lessThan", 90)]],
    ["1 same date field (library.added), weeks against days", [dated("library.added", "c1", "lessThan", 8, "weeks"), dated("library.added", "c2", "moreThan", 90)]],
    ["1 same date field (show.lastEpisodeAdded)", [dated("show.lastEpisodeAdded", "c1", "moreThan", 365), dated("show.lastEpisodeAdded", "c2", "lessThan", 30)]],
    ["2 never and less than", [lastPlayed("c1", "never"), lastPlayed("c2", "lessThan", 60)]],
    ["3 never and plays at least 1", [lastPlayed("c1", "never"), plays("c2", "atLeast", 1)]],
    ["4 size more than and less than", [size("c1", "moreThan", 50), size("c2", "lessThan", 20)]],
    ["5 plays at least and fewer than, same window", [plays("c1", "atLeast", 3, { kind: "last", duration: d(1, "years") }), plays("c2", "fewerThan", 2, { kind: "last", duration: d(365) })]],
    ["6 seasons on disk at least and fewer than", [seasons("c1", "atLeast", 4), seasons("c2", "fewerThan", 4)]],
    ["7 newest and not newest", [position("c1", "newest", 2), position("c2", "notNewest", 3)]],
    ["8 no request and request age", [exists("c1", false), buildCondition("request.age", { id: "c2" })]],
    ["8 no request and the requesters", [exists("c1", false), buildCondition("request.requesters", { id: "c2" })]],
    ["8 no request and requested by any of", [exists("c1", false), buildCondition("request.by", { id: "c2", op: "anyOf" })]],
    ["8 no request and requested by only", [exists("c1", false), buildCondition("request.by", { id: "c2", op: "only" })]],
  ])("pair %s", (_name, conditions) => {
    expect(findContradictions(rule(...conditions), options)).toEqual([{ conditionId: "c1", otherId: "c2" }])
  })

  it("finds a pair in either order and names the earlier condition first", () => {
    expect(findContradictions(rule(plays("c4", "atLeast", 1), lastPlayed("c7", "never")), options)).toEqual([{ conditionId: "c4", otherId: "c7" }])
    expect(findContradictions(rule(buildCondition("request.age", { id: "c1" }), exists("c2", false)), options)).toEqual([{ conditionId: "c1", otherId: "c2" }])
  })

  it("9 played less than N days ago and G4 of D days, N ≤ D", () => {
    expect(findContradictions(rule(lastPlayed("c1", "lessThan", 30)), options)).toEqual([{ conditionId: "c1", otherId: "g4" }])
  })

  it("10 added less than N days ago and G6 of D days, N ≤ D", () => {
    expect(findContradictions(rule(dated("library.added", "c1", "lessThan", 14)), options)).toEqual([{ conditionId: "c1", otherId: "g6" }])
  })

  it("11 plays fewer than 0, one condition", () => {
    expect(findContradictions(rule(plays("c1", "fewerThan", 0)), options)).toEqual([{ conditionId: "c1", otherId: "c1" }])
  })
})

describe("findContradictions: pairs that do not cancel", () => {
  it.each<[string, Condition[]]>([
    ["a date window that leaves room", [lastPlayed("c1", "moreThan", 180), lastPlayed("c2", "lessThan", 365)]],
    ["two date fields", [dated("library.added", "c1", "moreThan", 365), dated("request.age", "c2", "lessThan", 30)]],
    ["two lower bounds", [size("c1", "moreThan", 50), size("c2", "moreThan", 20)]],
    ["a size window", [size("c1", "moreThan", 20), size("c2", "lessThan", 50)]],
    ["plays in two windows", [plays("c1", "atLeast", 3, { kind: "total" }), plays("c2", "fewerThan", 2, { kind: "last", duration: d(30) })]],
    ["never and plays at least 0", [lastPlayed("c1", "never"), plays("c2", "atLeast", 0)]],
    ["never and more than, or never", [lastPlayed("c1", "never"), lastPlayed("c2", "moreThan", 365, true)]],
    ["newest 3 and not newest 1", [position("c1", "newest", 3), position("c2", "notNewest", 1)]],
    ["a request and its age", [exists("c1", true), buildCondition("request.age", { id: "c2" })]],
    ["no request and requested by none of", [exists("c1", false), buildCondition("request.by", { id: "c2", op: "noneOf" })]],
    ["seasons on disk 2 to 4", [seasons("c1", "atLeast", 2), seasons("c2", "fewerThan", 4)]],
  ])("%s", (_name, conditions) => {
    expect(findContradictions(rule(...conditions), options)).toEqual([])
  })

  it("does not cancel with G4 or G6 when the condition window is longer, or the protection is off", () => {
    expect(findContradictions(rule(lastPlayed("c1", "lessThan", 31), dated("library.added", "c2", "lessThan", 60)), options)).toEqual([])
    const off = buildOptions({ protections: { g4: { enabled: false }, g6: { enabled: false } } })
    expect(findContradictions(rule(lastPlayed("c1", "lessThan", 7), dated("library.added", "c2", "lessThan", 7)), off)).toEqual([])
  })

  it("reads top-level conditions only: a group is any of", () => {
    const compiled: Pick<CompiledRule, "clauses"> = {
      clauses: [
        { kind: "condition", id: "c1", condition: lastPlayed("c1", "never") },
        { kind: "group", id: "a1", conditions: [lastPlayed("c2", "lessThan", 30), plays("c3", "fewerThan", 0)] },
      ],
    }
    expect(findContradictions(compiled, options)).toEqual([])
  })

  it("lists every pair it finds, in clause order", () => {
    const found = findContradictions(rule(lastPlayed("c1", "never"), lastPlayed("c2", "lessThan", 10), plays("c3", "atLeast", 2)), options)
    expect(found).toEqual([
      { conditionId: "c1", otherId: "c2" },
      { conditionId: "c1", otherId: "c3" },
      { conditionId: "c2", otherId: "g4" },
    ])
  })
})
