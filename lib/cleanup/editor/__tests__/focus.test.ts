/** Focus targets (UX 7.9, UX 4.4 item 1, UX 4.3.8 item 2.2): the editor part, each draft action, error links and events. */

import { buildCondition, buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import { type DraftAction, draftReducer, type DraftState, initDraftState } from "@/lib/cleanup/editor/draft"
import { editorFocusPart, EVENT_FOCUS, focusAfter, focusAfterClose, focusAfterRemove, focusForError } from "@/lib/cleanup/editor/focus"
import type { DraftCondition, DraftGroup, RuleDraft } from "@/lib/validations/cleanup-draft"

const c = (id: string, field: DraftCondition["field"] = "library.added"): DraftCondition => ({ ...buildCondition(field), id })
const group = (id: string, ...conditions: DraftCondition[]): DraftGroup => ({ id, kind: "anyOf", conditions })
const draftOf = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({ ...buildDefinition(), conditions: [c("c1"), c("c2")], ...overrides })

function after(state: DraftState, action: DraftAction) {
  return focusAfter(action, state, draftReducer(state, action))
}

describe("editorFocusPart", () => {
  it("focuses the field search of a new row, and the part a token names", () => {
    const lastPlayed = buildCondition("watch.lastPlayed")
    expect(editorFocusPart(lastPlayed, "new")).toBe("fieldSearch")
    expect(editorFocusPart(lastPlayed, "field")).toBe("field")
    expect(editorFocusPart(lastPlayed, "operator")).toBe("operator")
    expect(editorFocusPart(lastPlayed, "value")).toBe("value")
  })

  it("falls back from the value input to the checked radio, the member combobox, then the operator", () => {
    expect(editorFocusPart(buildCondition("file.size"), "box")).toBe("value")
    expect(editorFocusPart(buildCondition("request.exists"), "box")).toBe("radio")
    expect(editorFocusPart(buildCondition("show.status"), "value")).toBe("radio")
    expect(editorFocusPart(buildCondition("request.requesters"), "box")).toBe("radio")
    expect(editorFocusPart(buildCondition("request.by"), "box")).toBe("combobox")
    expect(editorFocusPart(buildCondition("watch.lastPlayed", { op: "never" }), "box")).toBe("operator")
    expect(editorFocusPart({ field: "watch.lastPlayed", op: "sideways" }, "value")).toBe("value")
  })
})

describe("focusAfterRemove", () => {
  it("goes to the next row, else the previous row, else the add button (UX 7.2 item 3)", () => {
    const draft = draftOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3")), c("c4")], protections: [c("p1")] })
    expect(focusAfterRemove(draft, "c1")).toEqual({ kind: "row", id: "c2" })
    expect(focusAfterRemove(draft, "c3")).toEqual({ kind: "row", id: "c4" })
    expect(focusAfterRemove(draft, "a1")).toEqual({ kind: "row", id: "c4" })
    expect(focusAfterRemove(draft, "c4")).toEqual({ kind: "row", id: "c3" })
    expect(focusAfterRemove(draft, "p1")).toEqual({ kind: "add", list: "protections" })
    expect(focusAfterRemove(draftOf({ conditions: [c("c1")] }), "c1")).toEqual({ kind: "add", list: "conditions" })
    expect(focusAfterRemove(draft, "zz")).toBeNull()
  })
})

describe("focusAfter", () => {
  const state = () => initDraftState(draftOf({ conditions: [c("c1"), group("a1", c("c2"), c("c3")), c("c4")], protections: [c("p1")] }), "Rule")

  it("opens the new row's editor at the field search after an add (UX 7.1 item 3)", () => {
    expect(after(state(), { type: "add", to: "conditions" })).toEqual({ kind: "editor", id: "c5", part: "fieldSearch" })
    expect(after(state(), { type: "add", to: "protections" })).toEqual({ kind: "editor", id: "p2", part: "fieldSearch" })
    expect(after(state(), { type: "addToGroup", groupId: "a1" })).toEqual({ kind: "editor", id: "c5", part: "fieldSearch" })
  })

  it("goes to the first row of a new group, and to the new or moved row after a menu item", () => {
    expect(after(state(), { type: "addGroup" })).toEqual({ kind: "row", id: "c5" })
    expect(after(state(), { type: "duplicate", id: "c1" })).toEqual({ kind: "row", id: "c5" })
    expect(after(state(), { type: "toProtection", id: "c4" })).toEqual({ kind: "row", id: "p2" })
    expect(after(state(), { type: "toCondition", id: "p1" })).toEqual({ kind: "row", id: "c5" })
    expect(after(state(), { type: "groupWith", id: "c4", targetId: "c1" })).toEqual({ kind: "row", id: "c4" })
    expect(after(state(), { type: "moveOut", id: "c2" })).toEqual({ kind: "row", id: "c2" })
  })

  it("goes to the next row after a removal, and to the restored row after Undo (UX 7.2 item 5)", () => {
    expect(after(state(), { type: "remove", id: "c1" })).toEqual({ kind: "row", id: "c2" })
    const removed = draftReducer(state(), { type: "remove", id: "c4" })
    expect(after(removed, { type: "undo" })).toEqual({ kind: "row", id: "c4" })
    const noGroup = draftReducer(state(), { type: "remove", id: "a1" })
    expect(after(noGroup, { type: "undo" })).toEqual({ kind: "row", id: "c2" })
  })

  it("moves nothing for a refused action or an edit in place", () => {
    const one = initDraftState(draftOf({ conditions: [c("c1")] }), "Rule")
    expect(after(one, { type: "remove", id: "c1" })).toBeNull()
    expect(after(one, { type: "undo" })).toBeNull()
    expect(after(state(), { type: "setThen", then: { graceDays: 7 } })).toBeNull()
    expect(after(state(), { type: "setField", id: "c1", field: "file.size" })).toBeNull()
    const s = state()
    expect(focusAfter({ type: "undo" }, s, { ...s, undo: null })).toBeNull()
  })
})

describe("focusAfterClose, focusForError and events", () => {
  it("returns to the token or the box that opened the editor", () => {
    expect(focusAfterClose("c2", "operator")).toEqual({ kind: "token", id: "c2", part: "operator" })
    expect(focusAfterClose("p1", "box")).toEqual({ kind: "token", id: "p1", part: "box" })
  })

  it("focuses the token with the error and opens its editor (UX 7.9 'Error link')", () => {
    const draft = draftOf({ conditions: [c("c1"), group("a1", c("c2", "request.by"), c("c3"))], protections: [c("p1", "show.status")] })
    expect(focusForError(draft, "c1")).toEqual({ kind: "editor", id: "c1", part: "value" })
    expect(focusForError(draft, "c2")).toEqual({ kind: "editor", id: "c2", part: "combobox" })
    expect(focusForError(draft, "p1")).toEqual({ kind: "editor", id: "p1", part: "radio" })
    expect(focusForError(draft, "a1")).toEqual({ kind: "group", id: "a1" })
    expect(focusForError(draft, "libraries")).toEqual({ kind: "control", name: "libraries" })
    expect(focusForError(draft, "then.graceDays")).toEqual({ kind: "control", name: "grace" })
    expect(focusForError(draft, "then.action")).toEqual({ kind: "control", name: "action" })
    expect(focusForError(draft, "then.importListExclusion")).toEqual({ kind: "control", name: "action" })
    expect(focusForError(draft, "conditions")).toEqual({ kind: "add", list: "conditions" })
    expect(focusForError(draft, "protections")).toEqual({ kind: "add", list: "protections" })
    expect(focusForError(draft, "schemaVersion")).toEqual({ kind: "summary" })
  })

  it("names the targets of the editor events", () => {
    expect(EVENT_FOCUS).toEqual({
      saveWithErrors: { kind: "summary" },
      created: { kind: "title" },
      movedToDryRun: { kind: "moreActions" },
      switchedToReviewFirst: { kind: "moreActions" },
    })
  })
})
