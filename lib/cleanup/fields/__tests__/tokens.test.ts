/** The row grammar (TS 4.2): tokens of every field and operator, row parts, row sentences and draft rows. */

import { buildCondition } from "@/lib/cleanup/__tests__/helpers/builders"
import { anyFieldMeta, fieldMeta } from "@/lib/cleanup/fields/catalog"
import { conditionSentence, draftRowParts, INCOMPLETE_NOTE, partsText, rowParts } from "@/lib/cleanup/fields/sentence"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import type { Condition } from "@/lib/validations/cleanup-rule"
import { FIELD_IDS, GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

const words = { memberName: (id: string) => (id === "u1" ? "Dana Whitfield" : null) }

const ROWS: [Condition, string][] = [
  [buildCondition("watch.lastPlayed"), "Last played more than 365 days ago, or never"],
  [buildCondition("watch.lastPlayed", { value: { duration: { amount: 6, unit: "months" }, orNever: false } }), "Last played more than 6 months ago"],
  [buildCondition("watch.lastPlayed", { op: "lessThan", value: { duration: { amount: 30, unit: "days" }, orNever: false } }), "Last played less than 30 days ago"],
  [buildCondition("watch.lastPlayed", { op: "never" }), "Last played never"],
  [buildCondition("watch.plays", { op: "fewerThan", value: { count: 2, window: { kind: "last", duration: { amount: 365, unit: "days" } } } }),
    "Plays fewer than 2 in the last 365 days"],
  [buildCondition("watch.plays", { op: "atLeast", value: { count: 3, window: { kind: "total" } } }), "Plays at least 3 in total"],
  [buildCondition("request.exists"), "Requested in Overseerr: no"],
  [buildCondition("request.exists", { value: { exists: true } }), "Requested in Overseerr: yes"],
  [buildCondition("request.age"), "Requested more than 120 days ago"],
  [buildCondition("request.age", { op: "lessThan", value: { duration: { amount: 1, unit: "weeks" } } }), "Requested less than 1 week ago"],
  [buildCondition("request.by"), "Requested by only former members"],
  [buildCondition("request.by", { op: "anyOf", value: { requesters: [{ kind: "anyMember" }] } }), "Requested by any of any member"],
  [buildCondition("request.by", { op: "noneOf", value: { requesters: [{ kind: "member", userId: "u1" }, { kind: "inactive", days: 90 }] } }),
    "Requested by none of Dana Whitfield or members inactive for 90 days"],
  [buildCondition("request.requesters"), "The requesters never played it"],
  [buildCondition("request.requesters", { value: { did: "allFinished" } }), "The requesters all finished it"],
  [buildCondition("library.added", { value: { duration: { amount: 365, unit: "days" } } }), "Added more than 365 days ago"],
  [buildCondition("file.size"), "Size more than 20 GB"],
  [buildCondition("file.size", { op: "lessThan", value: { bytes: 1.5 * TiB, unit: "TB" } }), "Size less than 1.5 TB"],
  [buildCondition("show.status"), "Show status: ended"],
  [buildCondition("show.status", { value: { status: "continuing" } }), "Show status: continuing"],
  [buildCondition("show.lastEpisodeAdded"), "Last episode added more than 365 days ago"],
  [buildCondition("show.seasonsOnDisk"), "Seasons on disk at least 3"],
  [buildCondition("show.seasonsOnDisk", { op: "fewerThan", value: { count: 2 } }), "Seasons on disk fewer than 2"],
  [buildCondition("season.position"), "Season position not one of the 2 newest seasons"],
  [buildCondition("season.position", { op: "newest", value: { count: 1 } }), "Season position one of the 1 newest season"],
]

describe("tokens and row sentences", () => {
  it.each(ROWS)("reads %j as the row of TS 4.2", (c, sentence) => {
    expect(conditionSentence(c, words)).toBe(sentence)
  })

  it("splits a row into tokens and static words", () => {
    expect(rowParts(buildCondition("watch.lastPlayed"))).toEqual([
      { kind: "field", text: "Last played" },
      { kind: "operator", text: "more than" },
      { kind: "value", text: "365 days" },
      { kind: "text", text: "ago, or never" },
    ])
    expect(rowParts(buildCondition("show.status"))).toEqual([
      { kind: "field", text: "Show status" },
      { kind: "text", text: ":" },
      { kind: "value", text: "ended" },
    ])
    expect(rowParts(buildCondition("request.requesters"))).toEqual([
      { kind: "field", text: "The requesters" },
      { kind: "value", text: "never played it" },
    ])
  })

  it("gives the tokens of the frozen FieldMeta shape", () => {
    expect(fieldMeta("watch.plays").tokens(buildCondition("watch.plays"))).toEqual({ field: "Plays", operator: "fewer than", value: "1", after: "in total" })
    expect(fieldMeta("request.by").tokens(buildCondition("request.by", { value: { requesters: [{ kind: "member", userId: "u9" }] } }))).toEqual({
      field: "Requested by",
      operator: "only",
      value: "Unknown member",
    })
    expect(fieldMeta("season.position").tokens(buildCondition("season.position"))).toEqual({
      field: "Season position",
      operator: "not one of the",
      value: "2",
      after: "newest seasons",
    })
  })

  it("names the value control of each field", () => {
    const controls = FIELD_IDS.map((id) => anyFieldMeta(id).valueControl(anyFieldMeta(id).operators[0]))
    expect(controls).toEqual(["number", "number", "radio", "number", "combobox", "radio", "number", "number", "radio", "number", "number", "number"])
    expect(fieldMeta("watch.lastPlayed").valueControl("never")).toBe("none")
    expect(fieldMeta("request.exists").choices).toEqual([{ value: true, label: "Yes" }, { value: false, label: "No" }])
    expect(fieldMeta("request.requesters").choices?.map((c) => c.label)).toEqual(["never played it", "all finished it"])
    expect(fieldMeta("show.status").choices?.map((c) => c.label)).toEqual(["Ended", "Continuing"])
  })
})

describe("draftRowParts", () => {
  const draft = (field: DraftCondition["field"], op: string, value: unknown): DraftCondition => ({ id: "c4", field, op, value })

  it("gives the row of a complete draft condition", () => {
    expect(draftRowParts(buildCondition("file.size"), "movie")).toEqual({ parts: rowParts(buildCondition("file.size")), complete: true })
  })

  it("shows the prompt of an incomplete value (UX 8.4)", () => {
    const { parts, complete } = draftRowParts(draft("file.size", "moreThan", {}), "movie")
    expect(complete).toBe(false)
    expect(partsText(parts)).toBe("Size more than Enter a size")
    expect(INCOMPLETE_NOTE).toBe("Not used until complete.")
    expect(partsText(draftRowParts(draft("request.by", "noneOf", { requesters: [] }), "movie").parts)).toBe("Requested by none of Pick a member")
    expect(partsText(draftRowParts(draft("show.status", "is", {}), "show").parts)).toBe("Show status: Choose one")
    expect(partsText(draftRowParts(draft("watch.plays", "atLeast", null), "show").parts)).toBe("Plays at least Enter a number")
    expect(partsText(draftRowParts(draft("file.size", "lessThan", { bytes: 5, unit: "MB" }), "season").parts)).toBe("Size less than Enter a size")
  })

  it("shows a value out of range as typed: the error state", () => {
    expect(partsText(draftRowParts(draft("library.added", "moreThan", { duration: { amount: 0, unit: "days" } }), "movie").parts)).toBe("Added more than 0 days")
    expect(partsText(draftRowParts(draft("watch.lastPlayed", "lessThan", { duration: { amount: 4000, unit: "days" }, orNever: false }), "movie").parts))
      .toBe("Last played less than 4000 days")
    expect(partsText(draftRowParts(draft("file.size", "lessThan", { bytes: 0.5 * GiB, unit: "GB" }), "movie").parts)).toBe("Size less than 0.5 GB")
    expect(partsText(draftRowParts(draft("season.position", "newest", { count: 30 }), "season").parts)).toBe("Season position one of the 30")
    expect(partsText(draftRowParts(draft("watch.plays", "fewerThan", { count: 0, window: { kind: "last" } }), "movie").parts)).toBe("Plays fewer than 0")
  })

  it("keeps an operator with no value, and takes the default operator for an unknown one", () => {
    expect(partsText(draftRowParts(draft("watch.lastPlayed", "never", {}), "movie").parts)).toBe("Last played never")
    expect(partsText(draftRowParts(draft("library.added", "sideways", { duration: { amount: 5, unit: "fortnights" } }), "movie").parts))
      .toBe("Added more than Enter a number")
  })
})
