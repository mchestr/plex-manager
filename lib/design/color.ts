/**
 * Colour maths for the token mirror: OKLCH to sRGB, hex, WCAG 2.2 contrast,
 * sRGB compositing and colour-vision-deficiency separation.
 *
 * A TypeScript port of `design/mockups/ui/source/tools/color.js` and the
 * Machado matrices in `tokens.js`, so the token test computes the same ratios
 * the design measured (ui-design-system 3.4 and 4.4).
 *
 * ## Special cases
 *
 * - `oklch()` clamps out-of-gamut channels, as the browser does when it paints.
 * - `mix()` composites in gamma-encoded sRGB, which is what the browser does
 *   when it paints a translucent colour (an `-subtle` tint, an alert) over a
 *   surface.
 * - `deltaE()` reports OKLab distance x100; with a `cvd` kind it first applies
 *   the Machado 2009 simulation (severity 1) in linear sRGB.
 *
 * @example
 * ```ts
 * hex(toRgb('oklch(22.5% 0.005 255)')) // '#1a1c1e'
 * contrast(hexToRgb('#17130e').rgb, hexToRgb('#f1eadc').rgb).toFixed(2) // '15.44'
 * ```
 *
 * @module lib/design/color
 */

/** Gamma-encoded sRGB channels from 0 to 1. */
export type Rgb = readonly [number, number, number]
/** @internal */
export type Cvd = "deutan" | "protan"

const clamp = (x: number) => Math.min(1, Math.max(0, x))
const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
const ungamma = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
const map3 = (v: Rgb, f: (x: number) => number): Rgb => [f(v[0]), f(v[1]), f(v[2])]

/** sRGB for an OKLCH colour; `l` is 0 to 1 and `h` is in degrees. @internal */
export function oklch(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear: Rgb = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
  return map3(linear, (v) => clamp(gamma(clamp(v))))
}

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/

/** Parses `oklch(L% C H)` or `oklch(L% C H / a)`; L and a may also be plain numbers. @internal */
export function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } {
  const m = OKLCH.exec(value.trim())
  if (!m) throw new Error(`Not an oklch() colour: ${value}`)
  const alpha = m[5] === undefined ? 1 : Number(m[5]) / (m[6] ? 100 : 1)
  return { l: Number(m[1]) / (m[2] ? 100 : 1), c: Number(m[3]), h: Number(m[4]), alpha }
}

/** sRGB for an `oklch()` string, ignoring its alpha. @internal */
export function toRgb(value: string): Rgb {
  const { l, c, h } = parseOklch(value)
  return oklch(l, c, h)
}

const byte = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")

/** `#rrggbb`, or `#rrggbbaa` when `alpha` is below 1. */
export function hex(rgb: Rgb, alpha = 1): `#${string}` {
  return `#${rgb.map(byte).join("")}${alpha < 1 ? byte(alpha) : ""}`
}

/** Parses `#rrggbb` or `#rrggbbaa`. */
export function hexToRgb(value: string): { rgb: Rgb; alpha: number } {
  const h = value.replace("#", "")
  const at = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
  return { rgb: [at(0), at(2), at(4)], alpha: h.length === 8 ? at(6) : 1 }
}

/** WCAG relative luminance. @internal */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = map3(rgb, ungamma)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.2 contrast ratio, from 1 to 21. @internal */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `fg` at `alpha` painted over `bg`, composited in sRGB. @internal */
export function mix(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  const over = (i: 0 | 1 | 2) => fg[i] * alpha + bg[i] * (1 - alpha)
  return [over(0), over(1), over(2)]
}

const MACHADO: Record<Cvd, readonly [Rgb, Rgb, Rgb]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
}

/** Linear sRGB as seen with a full-severity deficiency (Machado 2009). */
function simulate(rgb: Rgb, kind: Cvd): Rgb {
  const lin = map3(rgb, ungamma)
  const [r, g, b] = MACHADO[kind]
  const dot = (row: Rgb) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])
  return [dot(r), dot(g), dot(b)]
}

function oklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** OKLab distance x100, optionally under a simulated colour-vision deficiency. @internal */
export function deltaE(a: Rgb, b: Rgb, cvd?: Cvd): number {
  const A = oklab(cvd ? simulate(a, cvd) : map3(a, ungamma))
  const B = oklab(cvd ? simulate(b, cvd) : map3(b, ungamma))
  return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}
