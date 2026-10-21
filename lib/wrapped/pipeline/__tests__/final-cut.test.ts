/**
 * @jest-environment node
 */

import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { slotHashesFor } from "@/lib/wrapped/pipeline/copy-step"
import { describeTally, planFinalCut, tallyFinalCut, type StoredIssue } from "@/lib/wrapped/pipeline/final-cut"

const fact = (value: number | string, unit: "share" | "title" | "count" | "hours" = "count") => ({ value, display: String(value), unit })

const PAGES: PageType[] = ["cover", "number", "top-shows", "clock", "centrefold", "back-cover"]

const SEASON: RewindFactsV3 = {
  "time.totalHours": fact(900, "hours"),
  "time.seriesShare": fact(0.7, "share"),
  "series[1].title": fact("Severance", "title"),
  "series[2].title": fact("Slow Horses", "title"),
  "series.top3Share": fact(0.6, "share"),
  "hours.peak": fact(22),
  "hours.afterDarkShare": fact(0.28, "share"),
  "archetype.id": fact("loyalist", "title"),
  "member.firstName": fact("Sam", "title"),
  "window.finalCut": fact(0),
}

function stored(facts: RewindFactsV3 = SEASON, pages: PageType[] = PAGES, edition: StoredIssue["edition"] = "full"): StoredIssue {
  return { edition, pages, facts, hasCopy: edition === "full", slotHashes: edition === "full" ? slotHashesFor(pages, facts) : {} }
}

const next = (changes: Partial<RewindFactsV3> = {}, selected: PageType[] = PAGES) => ({
  edition: "full" as const,
  selected,
  facts: { ...SEASON, "time.totalHours": fact(1010, "hours"), "window.finalCut": fact(1), ...changes } as RewindFactsV3,
})

describe("planFinalCut", () => {
  it("keeps every slot of a deck whose numbers only grew", () => {
    const plan = planFinalCut(stored(), next())
    expect(plan.regenerate).toEqual([])
    expect(plan.keep).toEqual(["deck.number", "deck.topShows", "deck.clock", "archetype.tagline", "archetype.dedication", "archetype.posterLineId", "signOff"])
  })

  it("regenerates the slots whose identity changed, naming the fact", () => {
    const plan = planFinalCut(stored(), next({ "series[1].title": fact("Slow Horses", "title"), "series[2].title": fact("Severance", "title") }))
    expect(plan.slots.filter((d) => d.action === "regenerate")).toEqual([
      { slot: "deck.topShows", action: "regenerate", reason: "identity-changed", fact: "series[1].title" },
      { slot: "signOff", action: "regenerate", reason: "identity-changed", fact: "series[1].title" },
    ])
  })

  it("regenerates a slot whose band was crossed", () => {
    const plan = planFinalCut(stored(), next({ "hours.afterDarkShare": fact(0.31, "share") }))
    expect(plan.slots.filter((d) => d.action === "regenerate")).toEqual([
      { slot: "deck.clock", action: "regenerate", reason: "band-crossed", fact: "hours.afterDarkShare" },
    ])
  })

  it("keeps a share that moved inside its band", () => {
    expect(planFinalCut(stored(), next({ "hours.afterDarkShare": fact(0.29, "share") })).regenerate).toEqual([])
  })

  it("regenerates a newly selected page's slot", () => {
    const plan = planFinalCut(stored(SEASON, PAGES.filter((p) => p !== "clock")), next())
    expect(plan.slots.filter((d) => d.action === "regenerate")).toEqual([{ slot: "deck.clock", action: "regenerate", reason: "page-newly-selected" }])
  })

  it("regenerates the archetype slots when the archetype changed", () => {
    const plan = planFinalCut(stored(), next({ "archetype.id": fact("night-owl", "title") }))
    expect(plan.regenerate).toEqual(["archetype.tagline", "archetype.dedication", "archetype.posterLineId", "signOff"])
  })

  it("gives a pocket member who became full every slot", () => {
    const plan = planFinalCut(stored(SEASON, ["cover", "number", "short-list", "clock", "centrefold", "back-cover"], "pocket"), next())
    expect(plan.keep).toEqual([])
    expect(new Set(plan.slots.map((d) => d.action === "regenerate" && d.reason))).toEqual(new Set(["edition-changed"]))
    expect(plan.regenerate).toHaveLength(7)
  })

  it("plans nothing for a pocket or postcard issue", () => {
    expect(planFinalCut(stored(), { ...next(), edition: "pocket" })).toEqual({ slots: [], keep: [], regenerate: [] })
  })
})

describe("tallyFinalCut", () => {
  it("counts the members who keep all copy and the reasons of those who re-call", () => {
    const keepAll = { plan: planFinalCut(stored(), next()) }
    const newTop = { plan: planFinalCut(stored(), next({ "series[1].title": fact("Slow Horses", "title") })) }
    const band = { plan: planFinalCut(stored(), next({ "hours.afterDarkShare": fact(0.5, "share") })) }
    const tally = tallyFinalCut([keepAll, keepAll, newTop, band])
    expect(tally).toEqual({
      members: 4,
      keepAll: 2,
      recall: 2,
      reasons: { "identity-changed: series[1].title": 2, "band-crossed: hours.afterDarkShare": 1 },
    })
    expect(describeTally(tally)).toBe(
      "2 of 4 keep all copy, 2 re-call (band-crossed: hours.afterDarkShare; identity-changed: series[1].title)"
    )
  })
})
