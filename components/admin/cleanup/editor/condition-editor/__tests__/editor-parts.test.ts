import {
  applyPreset,
  captionFor,
  conditionError,
  focusTarget,
  histogramTitle,
  kebab,
  mainValueOf,
  presetKey,
  setUpIn,
  withField,
  withOperator,
} from "@/components/admin/cleanup/editor/condition-editor/editor-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const lastPlayed: DraftCondition = { id: "c1", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } }

describe("editor parts", () => {
  it("makes kebab-case test id parts", () => {
    expect(kebab("watch.lastPlayed")).toBe("watch-last-played")
    expect(kebab("notNewest")).toBe("not-newest")
    expect(presetKey("365 days")).toBe("365-days")
    expect(presetKey("20 GB")).toBe("20-gb")
    expect(kebab("never played it")).toBe("never-played-it")
  })

  it("checks values with the X4 messages, and an operator with no value never fails", () => {
    expect(conditionError(lastPlayed)).toBeNull()
    expect(conditionError({ ...lastPlayed, value: { duration: { amount: 12, unit: "years" }, orNever: true } })).toBe(
      "Enter a whole number of years from 1 to 10."
    )
    expect(conditionError({ ...lastPlayed, op: "never", value: null })).toBeNull()
    expect(conditionError({ ...lastPlayed, op: "atLeast" })).toBe("Choose an operator.")
  })

  it("keeps the value on an operator change, but completes Never with the default", () => {
    expect(withOperator(lastPlayed, "lessThan", "movie")).toEqual({ ...lastPlayed, op: "lessThan" })
    expect(withOperator({ ...lastPlayed, value: { duration: null } }, "never", "movie")).toEqual({
      ...lastPlayed,
      op: "never",
      value: { duration: { amount: 365, unit: "days" }, orNever: true },
    })
  })

  it("gives a chosen field its default at the level, and keeps the same field", () => {
    expect(withField(lastPlayed, "file.size", "show")).toEqual({ id: "c1", field: "file.size", op: "moreThan", value: { bytes: 100 * GiB, unit: "GB" } })
    expect(withField(lastPlayed, "watch.lastPlayed", "movie")).toBe(lastPlayed)
  })

  it("reads and sets the main value of each kind of field", () => {
    expect(mainValueOf(lastPlayed)).toEqual({ amount: 365, unit: "days" })
    expect(mainValueOf({ field: "file.size", value: { bytes: GiB, unit: "GB" } })).toBe(GiB)
    expect(mainValueOf({ field: "show.seasonsOnDisk", value: { count: 3 } })).toBe(3)
    expect(mainValueOf({ field: "show.seasonsOnDisk", value: 3 })).toBeUndefined()
    expect(applyPreset({ id: "c1", field: "watch.plays", op: "atLeast", value: null }, 2, "movie")).toEqual({
      id: "c1",
      field: "watch.plays",
      op: "atLeast",
      value: { count: 2, window: { kind: "total" } },
    })
    expect(applyPreset({ ...lastPlayed, value: "x" }, { amount: 90, unit: "days" }, "movie").value).toEqual({
      duration: { amount: 90, unit: "days" },
      orNever: true,
    })
  })

  it("counts a service as set up unless every entry of it is notConfigured", () => {
    const isSetUp = setUpIn([
      { service: "sonarr", state: "notConfigured", readAt: null },
      { service: "plex", state: "notConfigured", readAt: null, part: "shares" },
      { service: "plex", state: "ok", readAt: null, part: "server" },
    ])
    expect(isSetUp("sonarr")).toBe(false)
    expect(isSetUp("plex")).toBe(true)
    expect(isSetUp("radarr")).toBe(true)
  })

  it("words the caption and the histogram title", () => {
    expect(captionFor("condition", 2, 3)).toBe("Condition 2 of 3")
    expect(captionFor("protection", 1, 1)).toBe("Protection 1 of 1")
    expect(histogramTitle("watch.lastPlayed", "movie")).toBe("Movies by last play")
    expect(histogramTitle("file.size", "season")).toBe("Seasons by size")
    expect(histogramTitle("watch.plays", "show")).toBe("Shows by value")
  })

  it("finds no focus target without a body", () => {
    expect(focusTarget(null, "value")).toBeNull()
    expect(focusTarget(document.createElement("div"), "value")).toBeNull()
  })
})
