/**
 * @jest-environment node
 */
import { contrast, deltaE, hex, hexToRgb, luminance, mix, oklch, parseOklch, toRgb } from "@/lib/design/color"

describe("lib/design/color.ts", () => {
  it("converts the graphite canvas to #1a1c1e", () => {
    expect(hex(toRgb("oklch(22.5% 0.005 255)"))).toBe("#1a1c1e")
    expect(hex(oklch(0.79, 0.155, 75))).toBe("#f4aa2c")
  })

  it("measures foreground on background at 15.45:1 and ink on paper at 15.44:1", () => {
    expect(contrast(toRgb("oklch(96.5% 0.003 255)"), toRgb("oklch(22.5% 0.005 255)")).toFixed(2)).toBe("15.45")
    expect(contrast(hexToRgb("#17130e").rgb, hexToRgb("#f1eadc").rgb).toFixed(2)).toBe("15.44")
  })

  it("puts black on white at 21:1, in either order", () => {
    const black = hexToRgb("#000000").rgb
    const white = hexToRgb("#ffffff").rgb
    expect(contrast(black, white)).toBeCloseTo(21)
    expect(contrast(white, black)).toBeCloseTo(21)
    expect(luminance(white)).toBeCloseTo(1)
  })

  it("parses oklch() with and without alpha", () => {
    expect(parseOklch("oklch(79% 0.155 75)")).toEqual({ l: 0.79, c: 0.155, h: 75, alpha: 1 })
    expect(parseOklch("oklch(14% 0.005 255 / 0.72)")).toEqual({ l: 0.14, c: 0.005, h: 255, alpha: 0.72 })
    expect(parseOklch("oklch(0.5 0.1 120 / 40%)")).toEqual({ l: 0.5, c: 0.1, h: 120, alpha: 0.4 })
    expect(() => parseOklch("#ffffff")).toThrow("Not an oklch() colour")
  })

  it("writes and reads hex with alpha", () => {
    const { rgb, alpha } = hexToRgb("#08090bb8")
    expect(hex(rgb, alpha)).toBe("#08090bb8")
    expect(alpha).toBeCloseTo(0.72, 2)
    expect(hexToRgb("#ffffff").alpha).toBe(1)
  })

  it("clamps an out-of-gamut colour into sRGB", () => {
    for (const channel of oklch(0.7, 0.4, 145)) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it("composites in sRGB", () => {
    expect(mix([1, 0, 0], [0, 0, 1], 0.25)).toEqual([0.25, 0, 0.75])
    expect(mix([1, 1, 1], [0, 0, 0], 0)).toEqual([0, 0, 0])
  })

  it("separates colours by OKLab distance, less so under a red-green deficiency", () => {
    const red = hexToRgb("#d62728").rgb
    const green = hexToRgb("#2ca02c").rgb
    expect(deltaE(red, red)).toBe(0)
    expect(deltaE(red, green)).toBeGreaterThan(deltaE(red, green, "deutan"))
    expect(deltaE(red, green)).toBeGreaterThan(deltaE(red, green, "protan"))
    // the design's worst adjacent chart pair (ui-design-system 3.5)
    expect(deltaE(hexToRgb("#9763cc").rgb, hexToRgb("#df5e97").rgb, "protan").toFixed(1)).toBe("10.1")
  })
})
