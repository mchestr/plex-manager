/**
 * @jest-environment node
 */
import { contrast, hex, hexToRgb, toRgb } from "@/lib/design/color"
import { inkProps, rewindInks, themes } from "@/lib/design/tokens"

describe("JSDoc Documentation Examples", () => {
  it("lib/design/color", () => {
    expect(hex(toRgb("oklch(22.5% 0.005 255)"))).toBe("#1a1c1e")
    expect(contrast(hexToRgb("#17130e").rgb, hexToRgb("#f1eadc").rgb).toFixed(2)).toBe("15.44")
  })

  it("lib/design/tokens", () => {
    expect(themes.dark.background.hex).toBe("#1a1c1e")
    expect(rewindInks.marigold.on.hex).toBe("#1f1306")
    expect(inkProps("ultramarine", { spot: "arch" })).toEqual({ "data-field": "ultramarine", className: "dark", "data-spot": "arch" })
  })
})
