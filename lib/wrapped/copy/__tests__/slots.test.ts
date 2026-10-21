/**
 * @jest-environment node
 */

import { FACTS, type RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { COPY_SLOTS, HERO_FACTS, SLOT_IDS, factPages, slotDependencyHash, slotsForPages } from "../slots"

const fact = (value: number | string, unit: "share" | "title" | "count" | "hours" = "count") => ({ value, display: String(value), unit })

describe("COPY_SLOTS", () => {
  it("declares every slot with its id and the design's limits", () => {
    expect(Object.keys(COPY_SLOTS)).toEqual([...SLOT_IDS])
    for (const id of SLOT_IDS) expect(COPY_SLOTS[id].id).toBe(id)
    expect(SLOT_IDS.filter((id) => id.startsWith("deck.")).every((id) => COPY_SLOTS[id].maxChars === 140)).toBe(true)
    expect([COPY_SLOTS["archetype.tagline"].maxChars, COPY_SLOTS["archetype.dedication"].maxChars, COPY_SLOTS.signOff.maxChars]).toEqual([70, 240, 120])
  })

  it("names only catalogue facts", () => {
    for (const slot of Object.values(COPY_SLOTS)) {
      for (const id of [...slot.allowedFacts, ...slot.identity, ...slot.bands.map((b) => b.fact)]) expect(FACTS).toHaveProperty([id])
    }
  })

  it("keeps each deck's hero fact out of its allowed facts", () => {
    for (const slot of Object.values(COPY_SLOTS)) {
      for (const hero of HERO_FACTS[slot.page] ?? []) expect(slot.allowedFacts).not.toContain(hero)
    }
  })

  it("lists window.finalCut on no slot: window wording belongs to the templates (P8.5)", () => {
    for (const slot of Object.values(COPY_SLOTS)) expect(slot.identity).not.toContain("window.finalCut")
  })

  it("returns only the selected pages' slots", () => {
    expect(slotsForPages(["cover", "number", "centrefold", "back-cover"]).map((s) => s.id)).toEqual([
      "deck.number", "archetype.tagline", "archetype.dedication", "archetype.posterLineId", "signOff",
    ])
  })

  it("maps facts to the pages that show them", () => {
    expect(factPages("series[1].title")).toEqual(["top-shows"])
    expect(factPages("hours.latestStart.time")).toEqual(["clock", "records"])
    expect(factPages("member.firstName")).toEqual([])
  })
})

describe("slotDependencyHash", () => {
  const clock = COPY_SLOTS["deck.clock"]
  const base: RewindFactsV3 = {
    "hours.peak": fact(22),
    "hours.latestStart.weekday": fact(0),
    "hours.afterDarkShare": fact(0.34, "share"),
    "hours.goldenShare": fact(0.41, "share"),
    "days.weekendShare": fact(0.38, "share"),
    "hours.medianStart": fact(1300),
  }

  it("is stable, and ignores numbers that merely grow", () => {
    expect(slotDependencyHash(clock, base)).toMatch(/^[0-9a-f]{64}$/)
    expect(slotDependencyHash(clock, { ...base })).toBe(slotDependencyHash(clock, base))
    expect(slotDependencyHash(clock, { ...base, "hours.afterDarkShare": fact(0.36, "share"), "hours.medianStart": fact(1310) })).toBe(
      slotDependencyHash(clock, base)
    )
  })

  it("changes when an identity fact changes or a band is crossed", () => {
    expect(slotDependencyHash(clock, { ...base, "hours.peak": fact(23) })).not.toBe(slotDependencyHash(clock, base))
    expect(slotDependencyHash(clock, { ...base, "hours.afterDarkShare": fact(0.52, "share") })).not.toBe(slotDependencyHash(clock, base))
  })

  it("holds across the final cut, so a deck whose numbers only grew keeps its copy", () => {
    const number = COPY_SLOTS["deck.number"]
    expect(slotDependencyHash(number, { "window.finalCut": fact(1) })).toBe(slotDependencyHash(number, { "window.finalCut": fact(0) }))
  })
})
