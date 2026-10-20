/**
 * @jest-environment node
 */

import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { groundArchetype, groundSlot } from "../grounding"
import { renderCopy, renderCopyText } from "../render-copy"
import { COPY_SLOTS, slotDependencyHash } from "../slots"
import { coverLines, slotTemplate, whyReasons } from "../templates"

const facts: RewindFactsV3 = {
  "series[1].title": { value: "Severance", display: "Severance", unit: "title" },
  "hours.afterDarkShare": { value: 0.34, display: "34%", unit: "share" },
  "window.finalCut": { value: 0, display: "0", unit: "count" },
  "time.daysHours": { value: 78420, display: "54\u00A0days, 11\u00A0hours", unit: "days-hours" },
  "time.perDay": { value: 234, display: "3\u00A0h 54\u00A0m", unit: "duration" },
}

describe("JSDoc Documentation Examples", () => {
  it("render-copy", () => {
    expect(renderCopy("You watched {{fact:series[1].title}} most.", facts)).toEqual([
      { kind: "text", text: "You watched " },
      { kind: "title", id: "series[1].title", text: "Severance" },
      { kind: "text", text: " most." },
    ])
    expect(renderCopyText("{{fact:series[1].title}} came first.", { "series[1].title": { display: "Ke$ha: $&", unit: "title" } })).toBe(
      "Ke$ha: $& came first."
    )
  })

  it("slots", () => {
    expect(slotDependencyHash(COPY_SLOTS["deck.clock"], facts)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("templates", () => {
    expect(slotTemplate("deck.number", { facts, userId: "a" })).toMatch(/^(That.s|Put|Every)/)
    expect(coverLines([{ type: "number", folio: 2 }, { type: "centrefold", folio: 9 }])).toEqual([
      { folio: 2, text: "One very large number" },
      { folio: 9, text: "Who you turned out to be" },
    ])
  })

  it("grounding", () => {
    const result = groundSlot("deck.clock", "Most of it after dark, and a good share of it in Lumon's hallways.", { facts, selected: ["clock"] })
    expect(result.ok ? [] : result.issues.map((i) => i.rule)).toEqual([3, 3, 4])
    const archetype = groundArchetype(
      { id: "midnight-marathoner", posterLineId: "lo.1" },
      { id: "midnight-marathoner", shortlist: [{ id: "midnight-marathoner", score: 80 }], llmMayChoose: false }
    )
    expect(archetype.ok ? [] : archetype.issues.map((i) => [i.rule, i.slot])).toEqual([[8, "archetype.posterLineId"]])
  })

  it("whyReasons: one reason per evidence fact", () => {
    expect(whyReasons([{ id: "midnight-marathoner", evidence: ["hours.peak"] }])).toEqual([
      { id: "midnight-marathoner", name: "The Midnight Marathoner", reasons: ["Your busiest hour was {{fact:hours.peak}}."] },
    ])
  })
})
