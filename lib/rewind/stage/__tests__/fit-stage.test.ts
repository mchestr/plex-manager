import { fitStage } from "../fit-stage"

const fit = (vw: number, vh: number, extra: { safeBottom?: number; rootFontPx?: number } = {}) =>
  fitStage({ vw, vh, safeBottom: extra.safeBottom ?? 0, rootFontPx: extra.rootFontPx ?? 16 })

describe("fitStage (design 4.7)", () => {
  it.each([
    [390, 844, "roomy", 1.0, false],
    [412, 760, "compact", 0.95, false],
    [390, 664, "compact", 0.81, false],
    [360, 640, "compact", 0.77, true],
    [375, 548, "compact", 0.64, true],
    [1440, 900, "roomy", 1.08, false],
  ] as const)("%ix%i is %s at %d", (vw, vh, variant, u, belowFloor) => {
    const result = fit(vw, vh)
    expect(result.chrome.variant).toBe(variant)
    expect(result.u).toBeCloseTo(u, 2)
    expect(result.belowFloor).toBe(belowFloor)
  })

  it("uses 76/75 roomy and 52/52 compact chrome, adding the safe area to the compact bottom", () => {
    expect(fit(390, 844, { safeBottom: 34 }).chrome).toEqual({ variant: "roomy", top: 76, bottom: 75 })
    expect(fit(390, 664, { safeBottom: 34 }).chrome).toEqual({ variant: "compact", top: 52, bottom: 86 })
  })

  it("keeps the 693 artboard when the height limits the scale", () => {
    expect(fit(390, 844).artboardH).toBeCloseTo(693, 5)
    expect(fit(412, 760).artboardH).toBe(693)
  })

  it("grows the artboard when the width limits the scale, up to 845", () => {
    expect(fit(390, 900).artboardH).toBeCloseTo(749, 5)
    expect(fit(390, 2000).artboardH).toBe(845)
  })

  it("caps the scale at 1.4", () => {
    const result = fit(1000, 2000)
    expect(result.u).toBe(1.4)
    expect(result.artboardH).toBe(845)
  })

  it("flags large text above a 20.8 px root font", () => {
    expect(fit(390, 844, { rootFontPx: 20.8 }).largeText).toBe(false)
    expect(fit(390, 844, { rootFontPx: 21 }).largeText).toBe(true)
  })
})
