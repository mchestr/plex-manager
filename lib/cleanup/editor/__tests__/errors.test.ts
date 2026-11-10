/** Save errors as UX words (UX 6, UX 7.7 item 5, X4, TS 3.2): each check code and each value error, keyed by condition id or field name. */

import { buildCondition, buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  automaticGraceMessage,
  draftErrors,
  type EditorError,
  errorFor,
  errorsFromFieldErrors,
  summaryLine,
  summaryTitle,
  toFieldErrors,
} from "@/lib/cleanup/editor/errors"
import { type DraftCondition, normaliseForSave, type RuleDraft } from "@/lib/validations/cleanup-draft"

const c = (id: string, field: DraftCondition["field"] = "library.added"): DraftCondition => ({ ...buildCondition(field), id })
const draftOf = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({ ...buildDefinition(), conditions: [c("c1")], ...overrides })

function errorsOf(draft: RuleDraft): EditorError[] {
  const result = normaliseForSave(draft)
  return result.success ? [] : draftErrors(draft, result.issues)
}

describe("draftErrors from normaliseForSave", () => {
  it("names the chosen unit in a duration error (X4), keyed by the condition id", () => {
    const draft = draftOf({ conditions: [c("c1"), { ...c("c2", "watch.lastPlayed"), value: { duration: { amount: 12, unit: "years" }, orNever: true } }] })
    expect(errorsOf(draft)).toEqual([{ key: "c2", code: "duration_range", label: "Last played", message: "Enter a whole number of years from 1 to 10." }])
  })

  it("maps each value error of a field to its UX 6 message", () => {
    const draft = draftOf({
      conditions: [
        { ...c("c1", "file.size"), value: {} },
        { id: "a1", kind: "anyOf", conditions: [{ ...c("c2", "request.by"), value: { requesters: [] } }, { ...c("c3", "show.seasonsOnDisk"), value: { count: 0 } }] },
      ],
      protections: [{ ...c("p1", "watch.plays"), op: "atLeast", value: { count: 1001, window: { kind: "total" } } }],
    })
    expect(errorsOf(draft).map((e) => [e.key, e.label, e.message])).toEqual([
      ["c1", "Size", "Enter a size from 1 GB to 50 TB."],
      ["c2", "Requested by", "Pick at least one member or group."],
      ["c3", "Seasons on disk", "Enter a whole number of seasons from 1 to 100."],
      ["p1", "Plays", "Enter a whole number of plays from 0 to 1000."],
    ])
  })

  it("maps each checkDefinition code", () => {
    const movie = draftOf({
      conditions: [c("c1"), c("c2", "show.status"), { ...c("c3", "watch.plays"), value: { count: 0, window: { kind: "total" } } }],
      then: { graceDays: 30, action: "show.delete", importListExclusion: false },
    })
    expect(errorsOf(movie).map((e) => [e.key, e.code, e.label, e.message])).toEqual([
      ["c2", "not_applicable", "Show status", "Show status does not apply to movies. Remove it, or change the level back."],
      ["c3", "fewer_than_zero", "Plays", "Enter a whole number of plays from 1 to 1000."],
      ["then.action", "action_level", "Then", "Choose an action for movies."],
    ])
    expect(errorFor(movie, { key: "then.importListExclusion", code: "exclusion_action" })).toEqual({
      key: "then.importListExclusion",
      code: "exclusion_action",
      label: "Then",
      message: "An import list exclusion needs a delete action.",
    })
    expect(errorFor(movie, { key: "c1", code: "duplicate_id" }).message).toBe("Two conditions have the same id. Remove one of them.")
  })

  it("gives one error for each key, the first one", () => {
    const draft = draftOf({ conditions: [{ id: "c1", field: "watch.plays", op: "atLeast", value: { count: -1, window: { kind: "last", duration: { amount: 0, unit: "days" } } } }] })
    const result = normaliseForSave(draft)
    expect(result.success ? 0 : result.issues.length).toBeGreaterThan(1)
    expect(errorsOf(draft)).toEqual([{ key: "c1", code: "too_small", label: "Plays", message: "Enter a whole number of plays from 0 to 1000." }])
  })

  it("asks for an operator or a value when the field has no message for it", () => {
    expect(errorsOf(draftOf({ conditions: [{ id: "c1", field: "file.size", op: "about", value: { bytes: 1 } }] }))[0].message).toBe("Choose an operator.")
    expect(errorsOf(draftOf({ conditions: [{ id: "c1", field: "show.status", op: "is", value: { status: "paused" } }], level: "show", then: { graceDays: 30, action: "show.delete", importListExclusion: true } }))[0].message).toBe(
      "Choose a value.",
    )
  })

  it("maps the group and the rule parts", () => {
    const draft = draftOf({ conditions: [c("c1"), { id: "a1", kind: "anyOf", conditions: [] }], libraries: [], then: { graceDays: 0, action: "movie.delete", importListExclusion: true } })
    expect(errorsOf(draft).map((e) => [e.key, e.label, e.message])).toEqual([
      ["a1", "Any of these", "Add a second condition, or remove the group."],
      ["libraries", "Clean up", "Choose at least one library."],
      ["then.graceDays", "Then", "Enter a whole number of days from 1 to 3650."],
    ])
    expect(errorsOf(draftOf({ conditions: [] }))).toEqual([{ key: "conditions", code: "too_small", label: "Find movies", message: "A rule needs at least one condition." }])
    expect(errorsOf(draftOf({ then: { graceDays: 30, importListExclusion: false } }))).toEqual([
      { key: "then.action", code: "invalid_value", label: "Then", message: "Choose an action." },
    ])
  })

  it("covers the limits and an unknown key", () => {
    const draft = draftOf({ conditions: [c("c1"), { id: "a1", kind: "anyOf", conditions: [] }] })
    expect(errorFor(draft, { key: "a1", code: "too_big" }).message).toBe("A group holds at most 10 conditions.")
    expect(errorFor(draft, { key: "a1", code: "duplicate_id" }).message).toBe("Two conditions have the same id. Remove one of them.")
    expect(errorFor(draft, { key: "libraries", code: "too_big" }).message).toBe("Choose at most 20 libraries.")
    expect(errorFor(draft, { key: "conditions", code: "too_big" }).message).toBe("A rule holds at most 20 conditions.")
    expect(errorFor(draft, { key: "protections", code: "too_big" })).toMatchObject({ label: "Never touch", message: "A rule holds at most 10 protections." })
    expect(errorFor(draft, { key: "schemaVersion", code: "invalid_value" })).toMatchObject({ label: "Rule", message: "Check this part of the rule." })
  })
})

describe("fieldErrors", () => {
  it("keys the messages by condition id or field name, and reads them back with labels (TS 10.1)", () => {
    const draft = draftOf({ conditions: [c("c1"), c("c2")] })
    const errors: EditorError[] = [
      { key: "c2", code: "duration_range", label: "Added", message: "Enter a whole number of days from 1 to 3650." },
      { key: "then.graceDays", code: "custom", label: "Then", message: automaticGraceMessage(7) },
      { key: "then.graceDays", code: "custom", label: "Then", message: "Second." },
    ]
    const fieldErrors = toFieldErrors(errors)
    expect(fieldErrors).toEqual({
      c2: ["Enter a whole number of days from 1 to 3650."],
      "then.graceDays": ["In Automatic, the grace period is at least 7 days.", "Second."],
    })
    expect(errorsFromFieldErrors(draft, { ...fieldErrors, libraries: [], other: undefined })).toEqual([
      { key: "c2", code: "VALIDATION", label: "Added", message: "Enter a whole number of days from 1 to 3650." },
      { key: "then.graceDays", code: "VALIDATION", label: "Then", message: "In Automatic, the grace period is at least 7 days." },
    ])
  })
})

describe("the error summary", () => {
  it("counts the things to fix (UX 8.4)", () => {
    expect(summaryTitle(2)).toBe("Fix 2 things before you save")
    expect(summaryTitle(1)).toBe("Fix 1 thing before you save")
  })

  it("starts each link with the part that holds the error (shots/14-states-builder.png)", () => {
    expect(summaryLine({ key: "c2", code: "x", label: "Last played", message: "Enter a whole number of days from 1 to 3650." })).toBe(
      "Last played: enter a whole number of days from 1 to 3650.",
    )
    expect(summaryLine({ key: "a1", code: "x", label: "Any of these", message: "Add a second condition, or remove the group." })).toBe(
      "Any of these: add a second condition, or remove the group.",
    )
    expect(summaryLine({ key: "c3", code: "x", label: "Show status", message: "Show status does not apply to movies. Remove it, or change the level back." })).toBe(
      "Show status does not apply to movies. Remove it, or change the level back.",
    )
  })
})
