/**
 * @jest-environment node
 */

/**
 * The History helpers: the next nightly run in the server zone, the reason
 * words of an outcome, a finished dry run with no rule left, an outcome
 * kind this build does not know, and the newest finished live run.
 */

import { buildCleanupOutcome, buildCleanupRun } from "@/__tests__/helpers/cleanup-factories"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import { historyRun, newestFinishedRun } from "@/lib/cleanup/screens/history/runs"
import { historyTitle } from "@/lib/cleanup/screens/history/titles"
import { nextNightlyRun, reasonWords } from "@/lib/cleanup/screens/history/words"
import type { People } from "@/lib/cleanup/screens/leaving/people"

const people: People = { ref: () => null, words: () => null }

describe("nextNightlyRun", () => {
  it("gives today's run before 03:07 and tomorrow's after it, in the server zone", () => {
    expect(nextNightlyRun(new Date("2026-11-08T02:00:00.000Z"), "UTC").toISOString()).toBe("2026-11-08T03:07:00.000Z")
    expect(nextNightlyRun(new Date("2026-11-08T03:07:00.000Z"), "UTC").toISOString()).toBe("2026-11-09T03:07:00.000Z")
    expect(nextNightlyRun(new Date("2026-11-08T05:00:00.000Z"), "America/Toronto").toISOString()).toBe("2026-11-08T08:07:00.000Z")
  })
})

describe("reasonWords", () => {
  it("words services and failures, and a protection of an outcome with no rule", () => {
    const words = reasonWords({ protections: buildOptions().protections, definition: () => null })(buildCleanupOutcome({ ruleIds: [], level: "show" }))

    expect(words.service("sonarr")).toBe("Sonarr")
    expect(words.failure("HTTP")).toBe("Sonarr returned HTTP error")
    expect(words.protection("p3")).toBe("This rule's protection.")
    expect(words.protection("g2")).toBe("Marked Keep forever by a member.")
  })
})

describe("historyRun", () => {
  it("reads a finished dry run whose rules are gone with no rule name", () => {
    const run = historyRun(buildCleanupRun({ kind: "dryRun", outcome: "dryRun", ruleIds: [], matched: 4 }),
      { people, rule: (id) => ({ id, name: id }), cause: () => null, waiting: null })

    expect(run.outcomeValues).toEqual({ rule: "", matches: 4 })
  })

  it("finds the newest finished live run", () => {
    expect(newestFinishedRun([
      { id: "a", kind: "dryRun", outcome: "dryRun", finishedAt: new Date() },
      { id: "b", kind: "run", outcome: "finished", finishedAt: null },
      { id: "c", kind: "run", outcome: "blocked", finishedAt: new Date() },
      { id: "d", kind: "run", outcome: "finished", finishedAt: new Date() },
    ])).toBe("d")
    expect(newestFinishedRun([])).toBeNull()
  })
})

describe("historyTitle", () => {
  it("reads an outcome kind it does not know as deleted", () => {
    const words = reasonWords({ protections: buildOptions().protections, definition: () => null })
    const row = historyTitle(buildCleanupOutcome({ kind: "archived" }), { people, rule: (id) => ({ id, name: id }), words })

    expect([row.kind, row.result, row.cause]).toEqual(["deleted", "deleted", null])
  })
})
