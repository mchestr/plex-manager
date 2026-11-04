/**
 * The accent colour (Settings, Appearance) as the app's primary tokens.
 *
 * The admin picks one `#rrggbb`. Each theme derives its primary family from
 * it so the design system's contrast rules still hold:
 *
 * ```
 * accent ──┬─ light: primary = accent, hover 4% darker,
 * │        │         indicator/ring darkened until 4.5:1 on the light background
 * │        └─ dark:  primary lightened until 3:1 on the dark background,
 * │                  hover 4% lighter, indicator/ring = primary
 * └─ every "-foreground" is near-black or near-white, whichever contrasts more;
 *    where neither reaches 4.5:1, the fill moves away from its ink until it does
 * ```
 *
 * The root layout writes the result as one `<style>` (`accentStyleSheet`),
 * scoped `html:root` and `html.dark` so it outranks the defaults in
 * `app/globals.css`. Rewind sets its own inks on its scope and is unaffected.
 *
 * @example
 * ```ts
 * accentTokens("#E4202B").light["primary-foreground"] // "#fafafa" (on a slightly darker red)
 * accentStyleSheet("not a colour") // ""
 * ```
 *
 * @module lib/branding/accent
 */

import { contrast, hex, hexToRgb, oklch, type Rgb } from "@/lib/design/color"
import { themes } from "@/lib/design/tokens"

export const ACCENT_PATTERN = /^#[0-9a-f]{6}$/i

type AccentToken =
  | "primary" | "primary-hover" | "primary-foreground"
  | "primary-indicator" | "primary-indicator-foreground"
  | "ring" | "sidebar-primary" | "sidebar-primary-foreground" | "sidebar-ring"

type AccentTokens = Record<"light" | "dark", Record<AccentToken, string>>

interface Lch { l: number; c: number; h: number }

const ungamma = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))

/** OKLCH for an sRGB colour (the inverse of `oklch()` in `lib/design/color`). */
function toLch(rgb: Rgb): Lch {
  const [r, g, b] = rgb.map(ungamma)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(a, B), h: ((Math.atan2(B, a) * 180) / Math.PI + 360) % 360 }
}

const rgbOf = ({ l, c, h }: Lch): Rgb => oklch(Math.min(1, Math.max(0, l)), c, h)
const shift = (lch: Lch, dl: number): Lch => ({ ...lch, l: Math.min(1, Math.max(0, lch.l + dl)) })

/** Steps lightness toward `direction` until the colour reaches `min` contrast on `bg`. */
function reach(lch: Lch, bg: Rgb, min: number, direction: 1 | -1): Lch {
  let next = lch
  const room = (l: number) => (direction > 0 ? l < 1 : l > 0)
  while (contrast(rgbOf(next), bg) < min && room(next.l)) next = shift(next, direction * 0.01)
  return next
}

const INK_DARK = hexToRgb(themes.dark["primary-foreground"].hex).rgb
const INK_LIGHT = hexToRgb(themes.light["primary-indicator-foreground"].hex).rgb

/** The text colour on a fill: near-black or near-white, whichever contrasts more. */
function inkOn(fill: Rgb): string {
  return hex(contrast(fill, INK_DARK) >= contrast(fill, INK_LIGHT) ? INK_DARK : INK_LIGHT)
}

/**
 * The fill moved away from its ink until the ink's text reads at 4.5:1:
 * darker under near-white text, lighter under near-black. A mid-tone such as
 * `#E4202B` gives white text only 4.3:1, so it darkens a few steps.
 */
function readableFill(lch: Lch): Lch {
  const light = contrast(rgbOf(lch), INK_LIGHT) > contrast(rgbOf(lch), INK_DARK)
  return reach(lch, light ? INK_LIGHT : INK_DARK, 4.5, light ? -1 : 1)
}

/** The primary family for each theme, as hex. @internal Tests check its contrast. */
export function accentTokens(accent: string): AccentTokens {
  const base = toLch(hexToRgb(accent).rgb)
  const lightBg = hexToRgb(themes.light.background.hex).rgb
  const darkBg = hexToRgb(themes.dark.background.hex).rgb

  const lightLch = readableFill(base)
  const lightPrimary = rgbOf(lightLch)
  const lightIndicator = rgbOf(reach(base, lightBg, 4.5, -1))
  const darkLch = readableFill(reach(base, darkBg, 3, 1))
  const darkPrimary = rgbOf(darkLch)

  return {
    light: {
      primary: hex(lightPrimary),
      "primary-hover": hex(rgbOf(shift(lightLch, -0.04))),
      "primary-foreground": inkOn(lightPrimary),
      "primary-indicator": hex(lightIndicator),
      "primary-indicator-foreground": inkOn(lightIndicator),
      ring: hex(lightIndicator),
      "sidebar-primary": hex(lightIndicator),
      "sidebar-primary-foreground": inkOn(lightIndicator),
      "sidebar-ring": hex(lightIndicator),
    },
    dark: {
      primary: hex(darkPrimary),
      "primary-hover": hex(rgbOf(shift(darkLch, 0.04))),
      "primary-foreground": inkOn(darkPrimary),
      "primary-indicator": hex(darkPrimary),
      "primary-indicator-foreground": inkOn(darkPrimary),
      ring: hex(darkPrimary),
      "sidebar-primary": hex(darkPrimary),
      "sidebar-primary-foreground": inkOn(darkPrimary),
      "sidebar-ring": hex(darkPrimary),
    },
  }
}

const declarations = (tokens: Record<string, string>) =>
  Object.entries(tokens).map(([name, value]) => `--${name}:${value};`).join("")

/** The `<style>` text for an accent; empty for anything but `#rrggbb`. */
export function accentStyleSheet(accent: string | null): string {
  if (!accent || !ACCENT_PATTERN.test(accent)) return ""
  const { light, dark } = accentTokens(accent)
  return `html:root{${declarations(light)}}html.dark{${declarations(dark)}}`
}
