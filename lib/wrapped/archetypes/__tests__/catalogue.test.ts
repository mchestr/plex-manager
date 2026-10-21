/**
 * The archetype catalogue: twelve archetypes, a complete tie-break order,
 * the design's colourways and sixty poster-line ids.
 */

import {
  ARCHETYPE_IDS,
  ARCHETYPE_STYLE,
  ARCHETYPES,
  LOW_VOLUME_SHORTLIST,
  POSTER_LINE_IDS,
  posterLineIds,
  TIE_BREAK_ORDER,
} from "@/lib/wrapped/archetypes/catalogue"

describe("the archetype catalogue", () => {
  it("has twelve archetypes", () => {
    expect(ARCHETYPE_IDS).toHaveLength(12)
    expect(ARCHETYPES).toHaveLength(12)
  })

  it("orders every archetype exactly once for tie-breaks", () => {
    expect([...TIE_BREAK_ORDER].sort()).toEqual([...ARCHETYPE_IDS].sort())
  })

  it("keeps the design's low-volume shortlist", () => {
    expect([...LOW_VOLUME_SHORTLIST].sort()).toEqual(["casual-critic", "comfort-rewatcher", "curator", "explorer"])
  })

  it("gives each archetype the field, spot and graphic of design 5.3", () => {
    expect(Object.keys(ARCHETYPE_STYLE).sort()).toEqual([...ARCHETYPE_IDS].sort())
    expect(ARCHETYPE_STYLE["midnight-marathoner"]).toEqual({ field: "ultramarine", spot: "marigold", graphic: "hour-ring" })
    expect(ARCHETYPE_STYLE["premiere-chaser"].spot).toBeNull()
    expect(new Set(Object.values(ARCHETYPE_STYLE).map((s) => s.field)).size).toBe(12)
  })

  it("has five poster-line ids per archetype (JSDoc example)", () => {
    expect(posterLineIds("midnight-marathoner")).toEqual(["mm.1", "mm.2", "mm.3", "mm.4", "mm.5"])
    expect(POSTER_LINE_IDS).toHaveLength(60)
    expect(new Set(POSTER_LINE_IDS).size).toBe(60)
  })
})
