import { registry } from "@/lib/rewind/registry"

import { pageInk } from "../page-ink"

describe("pageInk", () => {
  it("prints the cover and centrefold in the archetype's field with its spot", () => {
    expect(pageInk(registry.cover, "midnight-marathoner")).toEqual({ ink: "ultramarine", opts: { spot: "arch" } })
    expect(pageInk(registry.centrefold, "curator")).toEqual({ ink: "paper", opts: { spot: "arch" } })
  })

  it("switches a page to its alternate field when it equals the archetype's", () => {
    expect(pageInk(registry.number, "premiere-chaser")).toEqual({ ink: "peach", opts: {} })
    expect(pageInk(registry.number, "loyalist")).toEqual({ ink: "coral", opts: {} })
  })

  it("prints the back cover on paper in the archetype's deep ink", () => {
    expect(pageInk(registry["back-cover"], "loyalist")).toEqual({ ink: "paper", opts: { ink: "arch-deep" } })
  })

  it("falls back to paper and the fixed fields without an archetype", () => {
    expect(pageInk(registry.cover, null)).toEqual({ ink: "paper", opts: {} })
    expect(pageInk(registry["back-cover"], null)).toEqual({ ink: "paper", opts: {} })
    expect(pageInk(registry.clock, null)).toEqual({ ink: "forest", opts: {} })
  })
})
