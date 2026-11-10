/**
 * The words of a History run (UX 4.9 item 1, 8.7): each outcome, a run that
 * did not finish, who started it, and when.
 */

import { historyRun } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { runOutcomeText, startedByWords, startedWords } from "@/components/admin/cleanup/history/run-outcome"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })
const NOW = Date.parse("2026-11-08T12:00:00.000Z")

describe("runOutcomeText", () => {
  it.each([
    [{}, "Finished"],
    [{ waiting: 6, level: "show" }, "Finished. 6 shows wait for your approval."],
    [{ waiting: 2, level: "title" }, "Finished. 2 titles wait for your approval."],
    [{ failed: 1, cause: "Sonarr refused the delete" }, "Finished. 1 failed: Sonarr refused the delete."],
    [{ failed: 2 }, "Finished. 2 failed."],
  ])("reads a finished run with %j", (outcomeValues, words) => {
    expect(runOutcomeText(historyRun({ outcomeValues }))).toBe(words)
  })

  it("reads a dry run, a held run and a run with no outcome", () => {
    expect(runOutcomeText(historyRun({ outcome: "dryRun", outcomeValues: { rule: "Movies nobody watches", matches: 195 } }))).toBe(
      "Dry run of Movies nobody watches: 195 matches")
    expect(runOutcomeText(historyRun({ outcome: "dryRun", outcomeValues: { rule: "Invented rule", matches: 1 } }))).toBe("Dry run of Invented rule: 1 match")
    expect(runOutcomeText(historyRun({ outcome: "held", outcomeValues: { count: 52 } }))).toBe("Held: 52 new matches wait for your approval")
    expect(runOutcomeText(historyRun({ outcome: "held", outcomeValues: { count: 1 } }))).toBe("Held: 1 new match waits for your approval")
    expect(runOutcomeText(historyRun({ outcome: null }))).toBe("Finished")
  })

  it("names a safety stop by its block, with the rule of a short history", () => {
    expect(runOutcomeText(historyRun({ outcome: "blocked", blocks: [{ code: "sourceFailed", service: "tautulli" }] }))).toBe(
      "Safety stop: Tautulli did not answer")
    expect(runOutcomeText(historyRun({ outcome: "blocked", blocks: [{ code: "historyShort", ruleId: "rule-1" }] }))).toBe(
      "Safety stop: Tautulli history is shorter than the window of Movies nobody watches")
    expect(runOutcomeText(historyRun({ outcome: "blocked", blocks: [{ code: "historyShort", ruleId: "gone" }] }))).toBe(
      "Safety stop: Tautulli history is shorter than the window of A deleted rule")
  })

  it("reads a run that did not finish as stopped, and an outcome with no block by its own words", () => {
    expect(runOutcomeText(historyRun({ finishedAt: null, outcome: "finished" }))).toBe("Stopped: the server shut down")
    expect(runOutcomeText(historyRun({ outcome: "stopped", blocks: [{ code: "stopped" }] }))).toBe("Stopped: the server shut down")
    expect(runOutcomeText(historyRun({ outcome: "paused" }))).toBe("Paused: nothing changed")
    expect(runOutcomeText(historyRun({ outcome: "newerCode" }))).toBe("newerCode")
  })
})

describe("startedByWords and startedWords", () => {
  it("names who started the run", () => {
    expect(startedByWords(historyRun())).toBe("The schedule")
    expect(startedByWords(historyRun({ trigger: "admin", actor: { id: "u1", name: "Invented Admin", isYou: true } }))).toBe("You")
    expect(startedByWords(historyRun({ trigger: "approval", actor: { id: "u2", name: "Invented Admin", isYou: false } }))).toBe("Invented Admin")
    expect(startedByWords(historyRun({ trigger: "create", actor: null }))).toBe("The schedule")
  })

  it("reads today, yesterday and an older day with the time", () => {
    expect(startedWords("2026-11-08T03:07:00.000Z", NOW, f)).toBe("Today, 3:07 AM")
    expect(startedWords("2026-11-07T03:07:00.000Z", NOW, f)).toBe("Yesterday, 3:07 AM")
    expect(startedWords("2026-11-06T21:42:00.000Z", NOW, f)).toBe("Nov 6, 9:42 PM")
  })
})
