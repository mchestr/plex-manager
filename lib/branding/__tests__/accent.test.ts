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

it("keeps the picked colour as the light primary", () => {
  expect(accentTokens("#E4202B").light.primary).toBe("#e4202b")
  expect(accentTokens("#E4202B").light["primary-foreground"]).toBe("#fafafa")
})

describe("accentStyleSheet", () => {
  it("scopes each theme above the defaults", () => {
    const sheet = accentStyleSheet("#E4202B")
    expect(sheet).toMatch(/^html:root\{--primary:#e4202b;.*\}html\.dark\{--primary:#[0-9a-f]{6};.*\}$/)
  })

  it("writes nothing for no colour or anything but #rrggbb", () => {
    expect(accentStyleSheet(null)).toBe("")
    expect(accentStyleSheet("red;}body{display:none")).toBe("")
    expect(accentStyleSheet("#fff")).toBe("")
  })
})
