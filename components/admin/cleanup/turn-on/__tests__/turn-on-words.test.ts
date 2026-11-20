/**
 * The words of the turn-on page by mode (UX 4.6, 8.7, X14): the title, the
 * start mode, the button, the note under it for each action, the mode
 * cards, and the reason a press cannot go through.
 */

import { changeModeData, check, OK_CHECKS, turnOnData } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import {
  blockReason,
  buttonLabel,
  modeCardText,
  noteText,
  REDIS_REASON,
  startMode,
  stoppingChecks,
  titleText,
  typedCount,
} from "@/components/admin/cleanup/turn-on/turn-on-words"
import type { ActionId, Level } from "@/lib/validations/cleanup-vocabulary"

describe("titles and buttons", () => {
  it("names the page and the result in each mode", () => {
    expect(titleText(turnOnData())).toBe("Turn on Movies nobody watches")
    expect(titleText(changeModeData())).toBe("Change the mode of Movies nobody watches")
    expect(buttonLabel(turnOnData(), "reviewFirst")).toBe("Put 197 movies in Leaving soon")
    expect(buttonLabel(turnOnData({ count: 1 }), "automatic")).toBe("Put 1 movie in Leaving soon")
    expect(buttonLabel(changeModeData(), "automatic")).toBe("Switch to Automatic")
    expect(buttonLabel(changeModeData(), "reviewFirst")).toBe("Switch to Review first")
  })

  it("starts on the preselected mode only when it is allowed", () => {
    expect(startMode(turnOnData({ mode: "automatic" }))).toBe("reviewFirst")
    expect(startMode(changeModeData())).toBe("automatic")
    expect(startMode(turnOnData({ modes: [] }))).toBe("reviewFirst")
  })
})

describe("the note under the button", () => {
  it("says Review first", () => {
    expect(noteText(turnOnData(), "reviewFirst")).toBe("At the leave date: Review first. Nothing is deleted until you approve.")
  })

  it.each<[ActionId, Level, boolean, string]>([
    ["movie.delete", "movie", true, "At the leave date: Automatic. Radarr deletes the movies and their files, and adds an import list exclusion for each, inside the daily budget."],
    ["movie.delete", "movie", false, "At the leave date: Automatic. Radarr deletes the movies and their files, inside the daily budget."],
    ["movie.unmonitorDeleteFiles", "movie", false, "At the leave date: Automatic. Radarr deletes the files of the movies and stops monitoring them, inside the daily budget."],
    ["show.delete", "show", true, "At the leave date: Automatic. Sonarr deletes the shows and their files, and adds an import list exclusion for each, inside the daily budget."],
    ["show.unmonitorDeleteFiles", "show", false, "At the leave date: Automatic. Sonarr deletes the files of the shows and stops monitoring them, inside the daily budget."],
    ["season.unmonitorDeleteFiles", "season", false, "At the leave date: Automatic. Sonarr deletes the files of the seasons and stops monitoring them, inside the daily budget."],
  ])("says Automatic for %s", (action, level, importListExclusion, note) => {
    const text = noteText(turnOnData({ rule: { action, level, importListExclusion } }), "automatic")
    expect(text).toBe(note)
    expect(text).not.toContain(". inside")
  })
})

describe("the mode cards", () => {
  it("names the leave day from Dry run and each leave date in Change mode", () => {
    expect(modeCardText(turnOnData(), "reviewFirst", "Dec 8")).toBe(
      "On Dec 8 the batch waits for you on the Leaving soon tab. Nothing is deleted until you approve it."
    )
    expect(modeCardText(turnOnData(), "automatic", "Dec 8")).toBe(
      "On Dec 8 Radarr deletes the movies and their files, and adds an import list exclusion for each, inside the daily budget. " +
        "You can still exclude or postpone any movie before then."
    )
    expect(modeCardText(changeModeData({ rule: { action: "movie.unmonitorDeleteFiles" } }), "automatic", "Dec 8")).toBe(
      "At each leave date Radarr deletes the files of the movies and stops monitoring them, inside the daily budget. " +
        "You can still exclude or postpone any movie before then."
    )
  })
})

describe("blockReason", () => {
  const input = { data: changeModeData(), mode: "automatic" as const, redis: true, typed: "61" }

  it("is null when every check passes and the typed count matches", () => {
    expect(blockReason(input)).toBeNull()
    expect(blockReason({ ...input, typed: " 61 " })).toBeNull()
  })

  it("names the reasons in order: the job queue, a check, the same mode, the typed count", () => {
    const off = changeModeData({ checks: [check("featureOn", "failed", "all"), ...OK_CHECKS.slice(1)] })
    expect(blockReason({ ...input, redis: false, data: off })).toEqual({ kind: "redis", text: REDIS_REASON })
    expect(blockReason({ ...input, data: off })).toMatchObject({ kind: "check", check: { id: "featureOn" } })
    expect(blockReason({ ...input, mode: "reviewFirst" })).toEqual({ kind: "sameMode", text: "This rule is already in Review first." })
    expect(blockReason({ ...input, typed: "60" })).toEqual({ kind: "typed", text: "Type 61 to turn on Automatic." })
  })

  it("asks for no typed count in Review first, or at 50 items and fewer", () => {
    expect(typedCount(turnOnData(), "reviewFirst")).toBeNull()
    expect(typedCount(turnOnData({ typedApprovalCount: null }), "automatic")).toBeNull()
    expect(blockReason({ data: turnOnData(), mode: "reviewFirst", redis: true, typed: "" })).toBeNull()
  })

  it("lists the checks that stop the chosen mode", () => {
    const data = turnOnData({ checks: [check("notPaused", "failed", "all"), check("dryRuns", "info", "automatic"), check("kometa", "warning", "none")] })
    expect(stoppingChecks(data, "reviewFirst").map((c) => c.id)).toEqual(["notPaused"])
    expect(stoppingChecks(data, "automatic").map((c) => c.id)).toEqual(["notPaused", "dryRuns"])
  })
})
