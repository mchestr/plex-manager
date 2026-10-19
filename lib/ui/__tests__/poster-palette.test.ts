/**
 * The poster fallback palette (ui-design-system 3.11): eight ink pairs from
 * `rewindInks`, each 4.5:1 or better, picked stably by `ratingKey`.
 */

import { contrast, hexToRgb } from "@/lib/design/color"
import { rewindInks } from "@/lib/design/tokens"
import { POSTER_PALETTE, posterPalette } from "@/lib/ui/poster-palette"

describe("POSTER_PALETTE", () => {
  it("holds the eight inks of 3.11, from rewindInks", () => {
    expect(POSTER_PALETTE.map((pair) => pair.ink)).toEqual([
      "coral", "marigold", "rose", "sky", "mint", "ultramarine", "forest", "oxblood",
    ])
    for (const pair of POSTER_PALETTE) {
      expect(pair.field).toBe(rewindInks[pair.ink].field.hex)
      expect(pair.on).toBe(rewindInks[pair.ink].on.hex)
    }
  })

  it.each(POSTER_PALETTE.map((pair) => [pair.ink, pair] as const))("%s is 4.5:1 or better", (_ink, pair) => {
    expect(contrast(hexToRgb(pair.on).rgb, hexToRgb(pair.field).rgb)).toBeGreaterThanOrEqual(4.5)
  })
})

describe("posterPalette", () => {
  it("gives the same ratingKey the same pair every time", () => {
    for (const key of ["1", "12345", "98765", "a-key"]) {
      expect(posterPalette(key)).toBe(posterPalette(key))
    }
  })

  it("spreads keys over all eight pairs", () => {
    const used = new Set(Array.from({ length: 200 }, (_, i) => posterPalette(String(i)).ink))
    expect(used.size).toBe(8)
  })
})
