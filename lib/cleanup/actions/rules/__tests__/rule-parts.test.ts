/**
 * @jest-environment node
 */

/**
 * The pure parts of the rule actions: the fail text of each turn-on check
 * (UX 7.13), the diff of a save for its audit row (TS 11.1), the names of new
 * rules and copies (UX 4.2.2), and the library scope and service needs of a
 * definition (TS 10.3 create steps 2 and 3).
 */

import { buildCondition, buildDefinition, buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { checkFailureText } from "@/lib/cleanup/actions/rules/check-words"
import { ruleChanges } from "@/lib/cleanup/actions/rules/diff"
import { copyName, freeName } from "@/lib/cleanup/actions/rules/naming"
import { leafConditions, libraryInScope, neededServices } from "@/lib/cleanup/actions/rules/scope"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import { bindFormat } from "@/lib/utils/format"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })
const check = (id: TurnOnCheck["id"], values: TurnOnCheck["values"] = {}): TurnOnCheck => ({ id, state: "failed", blocks: "all", values })

describe("checkFailureText", () => {
  it.each<[TurnOnCheck, string]>([
    [check("featureOn"), "Media cleanup is off. Turn it on in Settings first."],
    [check("notPaused"), "Cleanup is paused. Resume it first."],
    [check("libraryData", { code: "noData" }), "No library data yet. Refresh data, or wait for the nightly read."],
    [check("libraryData", { code: "sourceFailed", service: "tautulli", readAt: "2026-11-08T03:07:00.000Z" }),
      "Tautulli did not answer at 3:07 AM. Refresh data, or wait for the nightly read."],
    [check("libraryData", { code: "dataStale", hours: 41 }), "Library data is 41 hours old. Refresh it first."],
    [check("libraryData", { code: "sourceShrank", service: "overseerr", rows: 0, previousRows: 312, counter: "overseerrRequests" }),
      "Overseerr returned 0 requests, 312 before. If you expect this, press Refresh data now: a read that you start and that agrees clears this stop."],
    [check("libraryData", { code: "noData", readAt: "not a date" }), "No library data yet. Refresh data, or wait for the nightly read."],
    [check("tautulliPlays"), "Tautulli recorded no play in 14 days."],
    [check("historyCovers", { days: 365, startAt: "2026-10-01T00:00:00.000Z" }), "Tautulli history starts Oct 1, 2026. That is shorter than the 365-day window of this rule."],
    [check("historyCovers", { days: 365 }), "Tautulli history is shorter than the 365-day window of this rule."],
    [check("dryRuns", { count: 0 }), "No finished dry run yet. Automatic needs one."],
    [check("firstBatchSize", { count: 197, checked: 777 }),
      "Not for this first batch, because it is more than 10 % of the movies checked (197 of 777). After the first batch, change the mode."],
    [check("firstBatchSize"), "Not for this first batch, because it is more than 10 % of the movies checked (0 of 0). After the first batch, change the mode."],
    [check("grace", { graceDays: 5, min: 7 }), "In Automatic, the grace period is at least 7 days."],
    [check("kometa"), "The numbers changed. Check them again."],
  ])("words %j", (failed, text) => {
    expect(checkFailureText(failed, "movie", f)).toBe(text)
  })
})

describe("ruleChanges", () => {
  const before = buildDefinition({
    conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [buildCondition("library.added", { id: "c2" }), buildCondition("file.size", { id: "c3" })] }],
    protections: [buildCondition("request.age", { id: "p1" })],
  })

  it("names the changed parts and the ids added, removed and edited, group members included", () => {
    const after = buildDefinition({
      libraries: ["1", "3"],
      conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("library.added", { id: "c2", value: { duration: { amount: 1, unit: "years" } } }),
        buildCondition("file.size", { id: "c4" })] }],
      protections: [buildCondition("request.age", { id: "p1" })],
      then: { graceDays: 60, action: "movie.delete", importListExclusion: true },
    })
    expect(ruleChanges({ name: "A", definition: before }, { name: "A", definition: after })).toEqual({
      changed: ["scope", "conditions", "then"], added: ["c4"], removed: ["c1", "c3"], edited: ["a1", "c2"],
    })
  })

  it("finds no change for the same rule with libraries in another order", () => {
    const def = buildDefinition({ libraries: ["1", "3"] })
    expect(ruleChanges({ name: "A", definition: def }, { name: "A", definition: { ...def, libraries: ["3", "1"] } })).toEqual({ changed: [], added: [], removed: [], edited: [] })
  })

  it("counts every part as changed against an unreadable stored rule", () => {
    expect(ruleChanges({ name: "A", definition: null }, { name: "B", definition: before }).changed).toEqual(["name", "scope", "conditions", "protections", "then"])
  })
})

describe("rule names", () => {
  it("keeps a free name, and numbers a taken one", () => {
    expect(freeName("  Old movies ", new Set())).toBe("Old movies")
    expect(freeName("Old movies", new Set(["Old movies", "Old movies 2"]))).toBe("Old movies 3")
  })

  it("keeps a numbered name within 80 characters", () => {
    const long = "x".repeat(80)
    expect(freeName(long, new Set([long]))).toBe(`${"x".repeat(78)} 2`)
    expect(copyName(long, new Set())).toBe(`${"x".repeat(75)} copy`)
  })

  it("names a copy, then numbers it", () => {
    expect(copyName("Big shows", new Set())).toBe("Big shows copy")
    expect(copyName("Big shows", new Set(["Big shows copy"]))).toBe("Big shows copy 2")
  })
})

describe("scope", () => {
  const [movies, shows] = buildSnapshotFacts().libraries

  it("offers a library of the level's type that its arr manages and whose items have ids", () => {
    expect(libraryInScope(movies, "movie")).toBe(true)
    expect(libraryInScope(shows, "show")).toBe(true)
    expect(libraryInScope(shows, "season")).toBe(true)
    expect(libraryInScope(movies, "show")).toBe(false)
    expect(libraryInScope({ ...movies, arr: "sonarr" }, "movie")).toBe(false)
    expect(libraryInScope({ ...movies, noIds: true }, "movie")).toBe(false)
  })

  it("lists every condition and the services they need, in service order", () => {
    const definition = buildDefinition({
      conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("request.requesters", { id: "c2" }), buildCondition("file.size", { id: "c3" })] }],
      protections: [buildCondition("watch.plays", { id: "p1" })],
    })
    expect(leafConditions(definition).map((c) => c.id)).toEqual(["c2", "c3", "p1"])
    expect(neededServices(definition)).toEqual(["tautulli", "overseerr"])
  })
})
