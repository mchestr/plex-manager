import { accentStyleSheet, accentTokens } from "@/lib/branding/accent"
import { contrast, hexToRgb } from "@/lib/design/color"
import { themes } from "@/lib/design/tokens"

const rgb = (value: string) => hexToRgb(value).rgb
const lightBg = rgb(themes.light.background.hex)
const darkBg = rgb(themes.dark.background.hex)

describe.each(["#E4202B", "#F4AA2C", "#1E3A8A", "#FFEB3B", "#000000", "#FFFFFF"])("accentTokens(%s)", (accent) => {
  const { light, dark } = accentTokens(accent)

  it("keeps the light indicator and ring at 4.5:1 on the light background", () => {
    expect(contrast(rgb(light["primary-indicator"]), lightBg)).toBeGreaterThanOrEqual(4.5)
    expect(light.ring).toBe(light["primary-indicator"])
  })

  it("keeps the dark primary at 3:1 on the dark background", () => {
    expect(contrast(rgb(dark.primary), darkBg)).toBeGreaterThanOrEqual(3)
  })

  it("keeps button text at 4.5:1 on the primary in both themes", () => {
    expect(contrast(rgb(light.primary), rgb(light["primary-foreground"]))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgb(dark.primary), rgb(dark["primary-foreground"]))).toBeGreaterThanOrEqual(4.5)
  })

  it("picks the more readable ink for every fill", () => {
    for (const [fill, ink] of [
      [light.primary, light["primary-foreground"]],
      [light["primary-indicator"], light["primary-indicator-foreground"]],
      [dark.primary, dark["primary-foreground"]],
    ]) {
      expect(contrast(rgb(fill), rgb(ink))).toBeGreaterThanOrEqual(3)
    }
  })
})

it("keeps a colour that already reads as the light primary", () => {
  expect(accentTokens("#1E3A8A").light.primary).toBe("#1e3a8a")
})

it("darkens a mid-tone red just enough for white text", () => {
  const { light } = accentTokens("#E4202B")
  expect(light["primary-foreground"]).toBe("#fafafa")
  expect(light.primary).not.toBe("#e4202b")
  expect(contrast(rgb(light.primary), rgb("#fafafa"))).toBeLessThan(4.8)
})

describe("accentStyleSheet", () => {
  it("scopes each theme above the defaults", () => {
    const sheet = accentStyleSheet("#E4202B")
    expect(sheet).toMatch(/^html:root\{--primary:#[0-9a-f]{6};.*\}html\.dark\{--primary:#[0-9a-f]{6};.*\}$/)
  })

  it("writes nothing for no colour or anything but #rrggbb", () => {
    expect(accentStyleSheet(null)).toBe("")
    expect(accentStyleSheet("red;}body{display:none")).toBe("")
    expect(accentStyleSheet("#fff")).toBe("")
  })
})
