import { pageTone, toneHexes } from "@/lib/rewind/media/tone"

describe("pageTone and toneHexes", () => {
  it("prints paper pages in the archetype's deep ink and colour pages in their own ink", () => {
    expect(pageTone("paper", "midnight-marathoner")).toEqual({ spot: "ultramarine", field: "paper" })
    expect(pageTone("paper", "series-devourer")).toEqual({ spot: "mint", field: "paper" })
    expect(pageTone("paper", null)).toEqual({ spot: "ultramarine", field: "paper" })
    expect(pageTone("marigold", "curator")).toEqual({ spot: "marigold", field: "marigold" })
  })

  it("resolves the documented hexes", () => {
    expect(toneHexes({ spot: "marigold", field: "marigold" })).toEqual({ spot: "#1f1306", field: "#feb644" })
    expect(toneHexes({ spot: "ultramarine", field: "paper" })).toEqual({ spot: "#2238b8", field: "#f1eadc" })
  })
})
