/**
 * `shareAlt` (P7.5): the share page's alt text for a published card, from the
 * projected page alone.
 */

import { shareAlt } from "@/lib/rewind/registry"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"

describe("shareAlt", () => {
  it("matches its documented example", () => {
    expect(shareAlt({ type: "top-shows", headline: "Severance led your year", titles: ["Severance", "Andor"], archetype: null })).toBe(
      "Top shows card. Severance led your year. Severance, Andor."
    )
  })

  it("names the archetype only where the page publishes it, and keeps a headline's own stop", () => {
    const archetype = { id: "midnight-marathoner" as const, name: "Midnight Marathoner", posterLine: "" }
    expect(shareAlt({ type: "centrefold", headline: "Up late, every week.", titles: [], archetype })).toBe(
      "Centrefold card. Up late, every week. I’m the Midnight Marathoner."
    )
    expect(shareAlt({ type: "centrefold", headline: "I’m the Midnight Marathoner", titles: [], archetype })).toBe(
      "Centrefold card. I’m the Midnight Marathoner."
    )
  })

  it("reads nothing but the projection on the heavy fixture: Top shows alone carries no archetype or hours", async () => {
    const heavy = await fixtureRewind("heavy")
    const shared = toShareSafe(heavy, shareOptions({ pages: ["top-shows"] }), shareContext())
    const alt = shareAlt(shared.pages[0])
    expect(alt.startsWith("Top shows card.")).toBe(true)
    expect(alt).toContain(shared.pages[0].titles[0])
    if (heavy.archetype) expect(alt).not.toMatch(new RegExp(heavy.archetype.id.replace(/-/g, "[ -]"), "i"))
    const hours = heavy.facts["time.totalHours"]?.display
    if (hours) expect(alt).not.toContain(hours)
  })
})
