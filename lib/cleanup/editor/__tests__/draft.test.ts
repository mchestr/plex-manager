/** The draft reducer (TS 12.6, UX 7): each action, undo, limits, the order of adding and ids that never come back. */

import { buildCondition, buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import { actionForLevel, type DraftAction, draftReducer, type DraftState, initDraftState } from "@/lib/cleanup/editor/draft"
import { countersOf, takeId } from "@/lib/cleanup/editor/ids"
import { findCondition, idsOf, notApplicableIds, rowIds } from "@/lib/cleanup/editor/tree"
import type { DraftCondition, DraftGroup, RuleDraft } from "@/lib/validations/cleanup-draft"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const c = (id: string, field: DraftCondition["field"] = "library.added"): DraftCondition => ({ ...buildCondition(field), id })
const group = (id: string, ...conditions: DraftCondition[]): DraftGroup => ({ id, kind: "anyOf", conditions })

function stateOf(overrides: Partial<RuleDraft> = {}): DraftState {
  return initDraftState({ ...buildDefinition(), conditions: [c("c1"), c("c2", "file.size")], ...overrides }, "Movies nobody watches")
}
const run = (state: DraftState, ...actions: DraftAction[]) => actions.reduce(draftReducer, state)
const ids = (state: DraftState) => state.draft.conditions.map((clause) => ("kind" in clause ? `${clause.id}(${clause.conditions.map((m) => m.id).join(",")})` : clause.id))

describe("initDraftState and ids", () => {
  it("starts each prefix one above its highest number", () => {
    const state = stateOf({ conditions: [c("c7"), group("a3", c("c2"), c("c9"))], protections: [c("p4")] })
    expect(state.next).toEqual({ c: 10, p: 5, a: 4 })
    expect(state.undo).toBeNull()
    expect(state.name).toBe("Movies nobody watches")
    expect(countersOf({ ...state.draft, conditions: [c("x1")] }).c).toBe(1)
    expect(takeId({ c: 999, p: 1, a: 1 }, "c")).toEqual({ id: "c999", next: { c: 1000, p: 1, a: 1 } })
    expect(takeId({ c: 1000, p: 1, a: 1 }, "c")).toBeNull()
  })

  it("never gives an id twice within a draft, and keeps the order of adding", () => {
    let state = run(stateOf(), { type: "add", to: "conditions" }, { type: "remove", id: "c3" }, { type: "add", to: "conditions" })
    expect(ids(state)).toEqual(["c1", "c2", "c4"])
    state = run(state, { type: "remove", id: "c4" }, { type: "undo" }, { type: "add", to: "conditions", field: "watch.plays" })
    expect(ids(state)).toEqual(["c1", "c2", "c4", "c5"])
    const all = idsOf(state.draft)
    expect(new Set(all).size).toBe(all.length)
  })

  it("refuses new ids past 999", () => {
    const state = stateOf({ conditions: [c("c999")] })
    expect(run(state, { type: "add", to: "conditions" })).toBe(state)
    expect(run(state, { type: "addGroup" })).toBe(state)
    expect(run(state, { type: "duplicate", id: "c999" })).toBe(state)
  })
})

describe("add", () => {
  it("adds a complete default row: 'Added more than 90 days ago' (UX 7.1)", () => {
    const state = run(stateOf(), { type: "add", to: "conditions" })
    expect(state.draft.conditions[2]).toEqual({ id: "c3", field: "library.added", op: "moreThan", value: { duration: { amount: 90, unit: "days" } } })
    const protection = run(state, { type: "add", to: "protections", field: "file.size" })
    expect(protection.draft.protections).toEqual([{ id: "p1", field: "file.size", op: "moreThan", value: { bytes: 20 * GiB, unit: "GB" } }])
  })

  it("adds to a group and adds a group of two default conditions (UX 7.4 item 1)", () => {
    const grouped = run(stateOf(), { type: "addGroup" })
    expect(grouped.draft.conditions[2]).toEqual(
      group("a1", { id: "c3", field: "request.exists", op: "is", value: { exists: false } }, { id: "c4", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } }),
    )
    const added = run(grouped, { type: "addToGroup", groupId: "a1", field: "watch.plays" })
    expect(ids(added)).toEqual(["c1", "c2", "a1(c3,c4,c5)"])
    expect(run(added, { type: "addToGroup", groupId: "c1" })).toBe(added)
  })

  it("refuses an add above the schema limits", () => {
    const full = stateOf({ conditions: Array.from({ length: 20 }, (_, i) => c(`c${i + 1}`)) })
    expect(run(full, { type: "add", to: "conditions" })).toBe(full)
    expect(run(full, { type: "addGroup" })).toBe(full)
    expect(run(full, { type: "duplicate", id: "c1" })).toBe(full)
    const protections = stateOf({ protections: Array.from({ length: 10 }, (_, i) => c(`p${i + 1}`)) })
    expect(run(protections, { type: "add", to: "protections" })).toBe(protections)
    expect(run(protections, { type: "duplicate", id: "p1" })).toBe(protections)
    expect(run(protections, { type: "toProtection", id: "c1" })).toBe(protections)
    const big = stateOf({ conditions: [group("a1", ...Array.from({ length: 10 }, (_, i) => c(`c${i + 1}`)))] })
    expect(run(big, { type: "addToGroup", groupId: "a1" })).toBe(big)
    expect(run(big, { type: "duplicate", id: "c3" })).toBe(big)
  })
})

describe("update and setField", () => {
  it("replaces a condition and keeps its id", () => {
    const state = run(stateOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3"))], protections: [c("p1"), c("p2")] }),
      { type: "update", id: "c3", condition: { field: "file.size", op: "lessThan", value: { bytes: 2 * GiB, unit: "GB" } } },
      { type: "update", id: "p1", condition: { field: "watch.plays", op: "atLeast", value: { count: 3, window: { kind: "total" } } } })
    expect(findCondition(state.draft, "c3")).toEqual({ id: "c3", field: "file.size", op: "lessThan", value: { bytes: 2 * GiB, unit: "GB" } })
    expect(findCondition(state.draft, "p1")?.op).toBe("atLeast")
    expect(findCondition(state.draft, "p2")).toEqual(c("p2"))
    expect(findCondition(state.draft, "c2")).toEqual(c("c2"))
    expect(run(state, { type: "update", id: "a1", condition: { field: "file.size", op: "x", value: 1 } })).toBe(state)
    expect(run(state, { type: "update", id: "c99", condition: { field: "file.size", op: "x", value: 1 } })).toBe(state)
  })

  it("gives a new field its default for the level (UX 7.1 item 5)", () => {
    const state = run(stateOf({ level: "show" }), { type: "setField", id: "c1", field: "file.size" })
    expect(state.draft.conditions[0]).toEqual({ id: "c1", field: "file.size", op: "moreThan", value: { bytes: 100 * GiB, unit: "GB" } })
  })
})

describe("remove and undo", () => {
  it("removes a row with an undo record, and Undo puts it back in its place (UX 7.2)", () => {
    const start = stateOf({ conditions: [c("c1"), c("c2"), c("c3")] })
    const removed = run(start, { type: "remove", id: "c2" })
    expect(ids(removed)).toEqual(["c1", "c3"])
    expect(removed.undo).toEqual({ removed: c("c2"), list: "conditions", before: { conditions: start.draft.conditions, protections: [] } })
    const undone = run(removed, { type: "undo" })
    expect(ids(undone)).toEqual(["c1", "c2", "c3"])
    expect(undone.undo).toBeNull()
  })

  it("clears the undo record at the next change, and on clearUndo", () => {
    const removed = run(stateOf({ conditions: [c("c1"), c("c2"), c("c3")] }), { type: "remove", id: "c2" })
    expect(run(removed, { type: "rename", name: "Other" }).undo).toBeNull()
    expect(run(removed, { type: "setThen", then: { graceDays: 14 } }).undo).toBeNull()
    expect(run(removed, { type: "clearUndo" }).undo).toBeNull()
    const clear = stateOf()
    expect(run(clear, { type: "clearUndo" })).toBe(clear)
    expect(run(clear, { type: "undo" })).toBe(clear)
    const twice = run(removed, { type: "remove", id: "c3" })
    expect(twice.undo?.removed).toEqual(c("c3"))
  })

  it("removes group members, whole groups and protections", () => {
    const start = stateOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3"))], protections: [c("p1"), c("p2")] })
    expect(ids(run(start, { type: "remove", id: "c3" }))).toEqual(["c1", "a1(c2)"])
    expect(ids(run(start, { type: "remove", id: "c3" }, { type: "remove", id: "c2" }))).toEqual(["c1"])
    const noGroup = run(start, { type: "remove", id: "a1" })
    expect(ids(noGroup)).toEqual(["c1"])
    expect(noGroup.undo?.removed).toEqual(start.draft.conditions[1])
    expect(ids(run(noGroup, { type: "undo" }))).toEqual(["c1", "a1(c2,c3)"])
    const protections = run(start, { type: "remove", id: "p1" })
    expect(protections.draft.protections.map((p) => p.id)).toEqual(["p2"])
    expect(protections.undo?.list).toBe("protections")
    expect(run(protections, { type: "undo" }).draft.protections.map((p) => p.id)).toEqual(["p1", "p2"])
    expect(run(start, { type: "remove", id: "zz" })).toBe(start)
  })

  it("never removes the last condition of a rule (UX 7.2 item 7)", () => {
    const one = stateOf({ conditions: [c("c1")], protections: [c("p1")] })
    expect(run(one, { type: "remove", id: "c1" })).toBe(one)
    const inGroup = stateOf({ conditions: [group("a1", c("c1"))] })
    expect(run(inGroup, { type: "remove", id: "c1" })).toBe(inGroup)
    expect(run(inGroup, { type: "remove", id: "a1" })).toBe(inGroup)
  })
})

describe("duplicate", () => {
  it("puts a copy with a new id right after the original", () => {
    const start = stateOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3")), c("c4")], protections: [c("p1"), c("p2")] })
    expect(ids(run(start, { type: "duplicate", id: "c1" }))).toEqual(["c1", "c5", "a1(c2,c3)", "c4"])
    expect(ids(run(start, { type: "duplicate", id: "c2" }))).toEqual(["c1", "a1(c2,c5,c3)", "c4"])
    const protections = run(start, { type: "duplicate", id: "p1" }).draft.protections
    expect(protections).toEqual([c("p1"), c("p3"), c("p2")])
    expect(run(start, { type: "duplicate", id: "a1" })).toBe(start)
  })
})

describe("groups", () => {
  const start = () => stateOf({ conditions: [c("c1"), c("c2"), group("a4", c("c3"), c("c4")), c("c5")] })

  it("groups two top-level conditions in the place of the earlier one (UX 7.4 item 2)", () => {
    expect(ids(run(start(), { type: "groupWith", id: "c5", targetId: "c2" }))).toEqual(["c1", "a5(c2,c5)", "a4(c3,c4)"])
    expect(ids(run(start(), { type: "groupWith", id: "c1", targetId: "c2" }))).toEqual(["a5(c1,c2)", "a4(c3,c4)", "c5"])
    const s = start()
    expect(run(s, { type: "groupWith", id: "c1", targetId: "c3" })).toBe(s)
    expect(run(s, { type: "groupWith", id: "c1", targetId: "a4" })).toBe(s)
    expect(run(s, { type: "groupWith", id: "c1", targetId: "c1" })).toBe(s)
    expect(run(s, { type: "groupWith", id: "c1", targetId: "c99" })).toBe(s)
  })

  it("ungroups in place, and moves a row out after its group (UX 7.4 items 3 and 4)", () => {
    expect(ids(run(start(), { type: "ungroup", groupId: "a4" }))).toEqual(["c1", "c2", "c3", "c4", "c5"])
    expect(ids(run(start(), { type: "moveOut", id: "c3" }))).toEqual(["c1", "c2", "a4(c4)", "c3", "c5"])
    expect(ids(run(start(), { type: "moveOut", id: "c3" }, { type: "moveOut", id: "c4" }))).toEqual(["c1", "c2", "c4", "c3", "c5"])
    const s = start()
    expect(run(s, { type: "ungroup", groupId: "c1" })).toBe(s)
    expect(run(s, { type: "moveOut", id: "c1" })).toBe(s)
    expect(run(s, { type: "moveOut", id: "a4" })).toBe(s)
  })

  it("refuses an ungroup or a move out above 20 clauses", () => {
    const full = stateOf({ conditions: [group("a1", c("c1"), c("c2")), ...Array.from({ length: 19 }, (_, i) => c(`c${i + 3}`))] })
    expect(run(full, { type: "ungroup", groupId: "a1" })).toBe(full)
    expect(run(full, { type: "moveOut", id: "c1" })).toBe(full)
  })
})

describe("protections", () => {
  it("turns a condition into a protection with a new p id, and back with a new c id", () => {
    const start = stateOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3"))], protections: [c("p1")] })
    const moved = run(start, { type: "toProtection", id: "c2" })
    expect(ids(moved)).toEqual(["c1", "a1(c3)"])
    expect(moved.draft.protections.map((p) => p.id)).toEqual(["p1", "p2"])
    expect(findCondition(moved.draft, "p2")).toEqual({ ...c("c2"), id: "p2" })
    const back = run(moved, { type: "toCondition", id: "p1" })
    expect(ids(back)).toEqual(["c1", "a1(c3)", "c4"])
    expect(back.draft.protections.map((p) => p.id)).toEqual(["p2"])
    expect(rowIds(back.draft, "conditions")).toEqual(["c1", "c3", "c4"])
  })

  it("refuses the last condition, a group, a protection twice and a condition as a protection id", () => {
    const one = stateOf({ conditions: [c("c1")], protections: [c("p1")] })
    expect(run(one, { type: "toProtection", id: "c1" })).toBe(one)
    expect(run(one, { type: "toProtection", id: "p1" })).toBe(one)
    expect(run(one, { type: "toCondition", id: "c1" })).toBe(one)
    const grouped = stateOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3"))] })
    expect(run(grouped, { type: "toProtection", id: "a1" })).toBe(grouped)
    const full = stateOf({ conditions: Array.from({ length: 20 }, (_, i) => c(`c${i + 1}`)), protections: [c("p1")] })
    expect(run(full, { type: "toCondition", id: "p1" })).toBe(full)
  })
})

describe("scope, Then and name", () => {
  it("keeps every condition on a level change, marks those that do not apply, and keeps the action's kind", () => {
    const state = stateOf({ level: "show", conditions: [c("c1", "show.status"), c("c2")], then: { graceDays: 30, action: "show.unmonitorDeleteFiles", importListExclusion: false } })
    const movie = run(state, { type: "setLevel", level: "movie", libraries: ["2"] })
    expect(ids(movie)).toEqual(["c1", "c2"])
    expect(notApplicableIds(movie.draft)).toEqual(["c1"])
    expect(movie.draft.libraries).toEqual(["2"])
    expect(movie.draft.then.action).toBe("movie.unmonitorDeleteFiles")
    expect(run(state, { type: "setLevel", level: "season" }).draft.libraries).toEqual(state.draft.libraries)
    expect(actionForLevel("movie.delete", "season")).toBe("season.unmonitorDeleteFiles")
    expect(actionForLevel("season.unmonitorDeleteFiles", "show")).toBe("show.unmonitorDeleteFiles")
    expect(actionForLevel("movie.delete", "show")).toBe("show.delete")
    expect(actionForLevel("show.delete", "show")).toBe("show.delete")
    expect(actionForLevel(undefined, "show")).toBeUndefined()
  })

  it("sets libraries, merges Then and renames", () => {
    const state = run(stateOf(), { type: "setLibraries", libraries: ["1", "2"] }, { type: "setThen", then: { graceDays: 14 } }, { type: "rename", name: "Old movies" })
    expect(state.draft.libraries).toEqual(["1", "2"])
    expect(state.draft.then).toEqual({ graceDays: 14, action: "movie.delete", importListExclusion: true })
    expect(state.name).toBe("Old movies")
  })

  it("resets to a saved draft with no undo record, and keeps the numbers already given out", () => {
    const start = stateOf()
    const edited = run(start, { type: "add", to: "conditions" }, { type: "add", to: "conditions" }, { type: "remove", id: "c4" })
    const reset = run(edited, { type: "reset", draft: start.draft, name: start.name })
    expect(reset.draft).toBe(start.draft)
    expect(reset.undo).toBeNull()
    expect(reset.next.c).toBe(5)
    expect(ids(run(reset, { type: "add", to: "conditions" }))).toEqual(["c1", "c2", "c5"])
  })
})
