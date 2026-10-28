/**
 * @jest-environment node
 */

import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { slotHashesFor } from "@/lib/wrapped/pipeline/copy-step"
import { planKeptSlots, type StoredIssue } from "@/lib/wrapped/pipeline/kept-slots"

const fact = (value: number | string, unit: "share" | "title" | "count" | "hours" = "count") => ({ value, display: String(value), unit })

const PAGES: PageType[] = ["cover", "number", "top-shows", "clock", "centrefold", "back-cover"]

const STORED: RewindFactsV3 = {
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

function stored(facts: RewindFactsV3 = STORED, pages: PageType[] = PAGES, edition: StoredIssue["edition"] = "full"): StoredIssue {
  return { edition, pages, facts, hasCopy: edition === "full", slotHashes: edition === "full" ? slotHashesFor(pages, facts) : {} }
}

const next = (changes: Partial<RewindFactsV3> = {}, selected: PageType[] = PAGES) => ({
  edition: "full" as const,
  selected,
  facts: { ...STORED, "time.totalHours": fact(860, "hours"), ...changes } as RewindFactsV3,
})

describe("planKeptSlots", () => {
  it("keeps every slot of a deck whose numbers only moved", () => {
    const plan = planKeptSlots(stored(), next())
    expect(plan.regenerate).toEqual([])
    expect(plan.keep).toEqual(["deck.number", "deck.topShows", "deck.clock", "archetype.tagline", "archetype.dedication", "archetype.posterLineId", "signOff"])
  })

  it("regenerates the slots whose identity changed, naming the fact", () => {
    const plan = planKeptSlots(stored(), next({ "series[1].title": fact("Slow Horses", "title"), "series[2].title": fact("Severance", "title") }))
    expect(plan.slots.filter((d) => d.action === "regenerate")).toEqual([
      { slot: "deck.topShows", action: "regenerate", reason: "identity-changed", fact: "series[1].title" },
      { slot: "signOff", action: "regenerate", reason: "identity-changed", fact: "series[1].title" },
    ])
  })

  it("regenerates a slot whose band was crossed", () => {
    const plan = planKeptSlots(stored(), next({ "hours.afterDarkShare": fact(0.31, "share") }))
    expect(plan.slots.filter((d) => d.action === "regenerate")).toEqual([
      { slot: "deck.clock", action: "regenerate", reason: "band-crossed", fact: "hours.afterDarkShare" },
    ])
  })

  it("keeps a share that moved inside its band", () => {
    expect(planKeptSlots(stored(), next({ "hours.afterDarkShare": fact(0.29, "share") })).regenerate).toEqual([])
  })

  it("regenerates a newly selected page's slot", () => {
    const plan = planKeptSlots(stored(STORED, PAGES.filter((p) => p !== "clock")), next())
    expect(plan.slots.filter((d) => d.action === "regenerate")).toEqual([{ slot: "deck.clock", action: "regenerate", reason: "page-newly-selected" }])
  })

  it("regenerates the archetype slots when the archetype changed", () => {
    const plan = planKeptSlots(stored(), next({ "archetype.id": fact("night-owl", "title") }))
    expect(plan.regenerate).toEqual(["archetype.tagline", "archetype.dedication", "archetype.posterLineId", "signOff"])
  })

  it("gives a pocket issue that became full every slot", () => {
    const plan = planKeptSlots(stored(STORED, ["cover", "number", "short-list", "clock", "centrefold", "back-cover"], "pocket"), next())
    expect(plan.keep).toEqual([])
    expect(new Set(plan.slots.map((d) => d.action === "regenerate" && d.reason))).toEqual(new Set(["edition-changed"]))
    expect(plan.regenerate).toHaveLength(7)
  })

  it("plans nothing for a pocket or postcard issue", () => {
    expect(planKeptSlots(stored(), { ...next(), edition: "pocket" })).toEqual({ slots: [], keep: [], regenerate: [] })
  })
})
