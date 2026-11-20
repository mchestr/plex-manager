/** Overlapping rules (TS 6.8, E21): grace, action care, exclusion, approval and batch merge, the show floor and the three overlap kinds. */

import {
  entryLeaveOn,
  type HoldingRule,
  joinedLeaveOn,
  mergeHoldingRules,
  ruleOverlaps,
  showLeaveFloor,
} from "@/lib/cleanup/engine/overlap"
import type { RuleThen } from "@/lib/validations/cleanup-rule"

const TODAY = "2026-11-08"

const rule = (id: string, createdAt: string, then: Partial<RuleThen> = {}, mode: HoldingRule["mode"] = "automatic"): HoldingRule => ({
  id,
  mode,
  createdAt,
  then: { graceDays: 30, action: "movie.delete", importListExclusion: false, ...then },
})

describe("mergeHoldingRules", () => {
  it("gives null for no holding rule", () => {
    expect(mergeHoldingRules([])).toBeNull()
  })

  it("takes the most careful action: unmonitor before delete (action care)", () => {
    const merged = mergeHoldingRules([rule("a", "2026-01-01", {}), rule("b", "2026-02-01", { action: "movie.unmonitorDeleteFiles" })])
    expect(merged?.action).toBe("movie.unmonitorDeleteFiles")
  })

  it("keeps the earlier rule's action at equal care, by createdAt and then id", () => {
    const one = rule("b", "2026-01-01", { action: "show.delete" })
    const two = rule("a", new Date("2026-03-01").toISOString(), { action: "show.delete" })
    expect(mergeHoldingRules([two, one])?.action).toBe("show.delete")
    const sameTime = mergeHoldingRules([
      { ...rule("b", "2026-01-01"), createdAt: new Date("2026-01-01") },
      { ...rule("a", "2026-01-01"), createdAt: new Date("2026-01-01") },
    ])
    expect(sameTime).toEqual({ action: "movie.delete", importListExclusion: false, needsApproval: false, batchRuleId: null })
    const review = (id: string) => rule(id, "2026-01-01", {}, "reviewFirst")
    expect(mergeHoldingRules([review("a"), review("b")])?.batchRuleId).toBe("a")
    expect(mergeHoldingRules([review("b"), review("a")])?.batchRuleId).toBe("a")
  })

  it.each<[string, Partial<RuleThen>[], boolean]>([
    ["one delete rule with it on", [{ importListExclusion: true }, {}], true],
    ["no delete rule with it on", [{}, {}], false],
    ["only an unmonitor rule with it on: delete wins nothing, unmonitor is more careful", [{ action: "movie.unmonitorDeleteFiles", importListExclusion: true }, {}], false],
    ["an unmonitor action with a delete rule that has it on", [{ action: "movie.unmonitorDeleteFiles" }, { importListExclusion: true }], false],
  ])("import list exclusion: %s", (_name, thens, expected) => {
    const merged = mergeHoldingRules(thens.map((then, i) => rule(`r${i}`, `2026-0${i + 1}-01`, then)))
    expect(merged?.importListExclusion).toBe(expected)
  })

  it("needs approval when one holding rule is in Review first, and batches under the first one by createdAt", () => {
    const merged = mergeHoldingRules([
      rule("auto", "2026-01-01"),
      rule("late", "2026-05-01", {}, "reviewFirst"),
      rule("early", "2026-03-01", {}, "reviewFirst"),
    ])
    expect(merged).toMatchObject({ needsApproval: true, batchRuleId: "early" })
  })

  it("needs no approval with only Automatic rules", () => {
    expect(mergeHoldingRules([rule("a", "2026-01-01"), rule("b", "2026-01-02")])).toMatchObject({ needsApproval: false, batchRuleId: null })
  })
})

describe("leave dates (grace)", () => {
  it("fixes the entry date at today plus the longest grace of the entering rules", () => {
    expect(entryLeaveOn([rule("a", "2026-01-01", { graceDays: 30 }), rule("b", "2026-01-02", { graceDays: 60 })], TODAY, null)).toBe("2027-01-07")
  })

  it("never enters before holdUntil or the show floor", () => {
    const rules = [rule("a", "2026-01-01", { graceDays: 7 })]
    expect(entryLeaveOn(rules, TODAY, "2026-11-30")).toBe("2026-11-30")
    expect(entryLeaveOn(rules, TODAY, null, "2026-12-24")).toBe("2026-12-24")
    expect(entryLeaveOn(rules, TODAY, "2026-11-30", "2026-11-20")).toBe("2026-11-30")
    expect(entryLeaveOn([], TODAY, null)).toBe(TODAY)
  })

  it("moves the date later for a rule that joins with a longer grace, counted from the entry day", () => {
    expect(joinedLeaveOn("2026-12-08", TODAY, [rule("b", "2026-01-01", { graceDays: 60 })])).toBe("2027-01-07")
  })

  it("never moves the date earlier for a rule that joins with a shorter grace", () => {
    expect(joinedLeaveOn("2026-12-08", TODAY, [rule("b", "2026-01-01", { graceDays: 14 })])).toBe("2026-12-08")
    expect(joinedLeaveOn("2026-12-08", TODAY, [])).toBe("2026-12-08")
  })

  it("counts days on the calendar across a month end", () => {
    expect(entryLeaveOn([rule("a", "2026-01-01", { graceDays: 1 })], "2026-12-31", null)).toBe("2027-01-01")
  })
})

describe("showLeaveFloor (E21)", () => {
  it.each<[string | null, (string | null)[], string | null]>([
    ["2026-12-08", [], "2026-12-08"],
    ["2026-12-08", ["2026-12-20", "2026-12-10"], "2026-12-20"],
    ["2026-12-08", ["2026-12-01", null], "2026-12-08"],
    [null, ["2026-12-01", "2026-12-05"], "2026-12-05"],
    [null, [null], null],
    [null, [], null],
  ])("show %s with seasons %j gives %s", (show, seasons, floor) => {
    expect(showLeaveFloor(show, seasons)).toBe(floor)
  })

  it("never moves a show earlier", () => {
    for (const seasons of [["2026-01-01"], ["2026-12-07", "2026-11-09"], [null]]) {
      expect(showLeaveFloor("2026-12-08", seasons)! >= "2026-12-08").toBe(true)
    }
  })
})

describe("ruleOverlaps", () => {
  const movies = { ruleId: "movies", items: [{ key: "movie:tmdb:1", showKey: null }, { key: "movie:tmdb:2", showKey: null }] }

  it("counts the same items (same)", () => {
    const other = { ruleId: "other", items: [{ key: "movie:tmdb:2", showKey: null }, { key: "movie:tmdb:3", showKey: null }] }
    expect(ruleOverlaps(movies, [movies, other])).toEqual([{ ruleId: "other", count: 1, kind: "same" }])
  })

  it("counts seasons of shows that a show rule matches (inShow)", () => {
    const seasons = { ruleId: "seasons", items: [
      { key: "season:tvdb:9:1", showKey: "show:tvdb:9" },
      { key: "season:tvdb:9:2", showKey: "show:tvdb:9" },
      { key: "season:tvdb:8:1", showKey: "show:tvdb:8" },
    ] }
    const shows = { ruleId: "shows", items: [{ key: "show:tvdb:9", showKey: null }] }
    expect(ruleOverlaps(seasons, [shows])).toEqual([{ ruleId: "shows", count: 2, kind: "inShow" }])
  })

  it("counts shows with a season that a season rule matches (hasSeasons)", () => {
    const shows = { ruleId: "shows", items: [{ key: "show:tvdb:9", showKey: null }, { key: "show:tvdb:7", showKey: null }] }
    const seasons = { ruleId: "seasons", items: [{ key: "season:tvdb:9:1", showKey: "show:tvdb:9" }, { key: "season:tvdb:9:2", showKey: "show:tvdb:9" }] }
    expect(ruleOverlaps(shows, [seasons])).toEqual([{ ruleId: "seasons", count: 1, kind: "hasSeasons" }])
  })

  it("lists every rule with an overlap, the largest count first, and none without one", () => {
    const a = { ruleId: "a", items: [{ key: "movie:tmdb:1", showKey: null }] }
    const b = { ruleId: "b", items: [{ key: "movie:tmdb:1", showKey: null }, { key: "movie:tmdb:2", showKey: null }] }
    const c = { ruleId: "c", items: [{ key: "movie:tmdb:9", showKey: null }] }
    expect(ruleOverlaps(movies, [a, b, c])).toEqual([
      { ruleId: "b", count: 2, kind: "same" },
      { ruleId: "a", count: 1, kind: "same" },
    ])
  })
})
