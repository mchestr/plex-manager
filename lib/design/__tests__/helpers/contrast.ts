/**
 * The contrast tables of ui-design-system 3.4, 3.5 and 4.4, as data: each row
 * is a pair, its measured value and its floor. The app pairs take a theme as
 * `oklch()` strings, so they can measure a parsed (or mutated) copy of the CSS;
 * the chart and Rewind pairs measure the hex in `tokens.ts`, which is what
 * Chart.js and Satori receive.
 */
import { contrast, deltaE, hexToRgb, mix, toRgb, type Cvd, type Rgb } from "@/lib/design/color"
import {
  archetypeInks,
  rewindInks,
  subtleAlpha,
  themes,
  type InkName,
  type ThemeName,
  type TokenName,
} from "@/lib/design/tokens"

export interface Row {
  label: string
  value: number
  min: number
}

const TEXT = ["foreground", "muted-foreground", "destructive", "success", "warning", "info", "sidebar-foreground"]
const TEXT_SURFACES = ["background", "card", "popover", "muted", "secondary", "accent", "sidebar"]
const SURFACES = ["background", "card", "popover", "muted", "sidebar"]
const TONES = ["destructive", "success", "warning", "info"]
const FILLS = [
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["destructive-foreground", "destructive"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["muted-foreground", "secondary-hover"],
]
/** Alerts tint the card with their tone at 8%. */
const ALERT_ALPHA = 0.08

/** Every app pair of 3.4: text 4.5:1, badges, fills and alerts 4.5:1, and the non-text marks 3:1. */
export function appRows(mode: ThemeName, theme: Record<string, string>): Row[] {
  const c = (name: string): Rgb => {
    if (!theme[name]) throw new Error(`${mode} has no ${name}`)
    return toRgb(theme[name])
  }
  const rows: Row[] = []
  const add = (label: string, value: number, min: number) => rows.push({ label: `${mode}: ${label}`, value, min })
  for (const fg of TEXT) for (const bg of TEXT_SURFACES) add(`${fg} on ${bg}`, contrast(c(fg), c(bg)), 4.5)
  for (const tone of TONES) {
    for (const bg of SURFACES) add(`${tone} badge on ${bg}`, contrast(c(tone), mix(c(tone), c(bg), subtleAlpha[mode])), 4.5)
  }
  for (const [fg, bg] of FILLS) add(`${fg} on ${bg}`, contrast(c(fg), c(bg)), 4.5)
  for (const tone of TONES) {
    const alert = mix(c(tone), c("card"), ALERT_ALPHA)
    add(`foreground on ${tone} alert`, contrast(c("foreground"), alert), 4.5)
    add(`muted-foreground on ${tone} alert`, contrast(c("muted-foreground"), alert), 4.5)
  }
  // primary is a mark only in dark, where primary-indicator equals it; in light it is a button fill
  const marks = ["input", "ring", "primary-indicator", "sidebar-primary", ...(mode === "dark" ? ["primary"] : [])]
  for (const mark of marks) for (const bg of SURFACES) add(`${mark} mark on ${bg}`, contrast(c(mark), c(bg)), 3)
  add("primary-indicator-foreground on primary-indicator", contrast(c("primary-indicator-foreground"), c("primary-indicator")), 3)
  return rows
}

const rgb = (hex: string) => hexToRgb(hex).rgb
const CHARTS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const
const VISION: { name: string; cvd?: Cvd }[] = [{ name: "normal" }, { name: "deutan", cvd: "deutan" }, { name: "protan", cvd: "protan" }]

/**
 * 3.5: each slot 3:1 on card, and adjacent slots at OKLab dE x100 of 10 or more,
 * with and without CVD. Measured on the hex, which is what Chart.js is given.
 */
export function chartRows(mode: ThemeName): Row[] {
  const c = (name: TokenName) => rgb(themes[mode][name].hex)
  const rows: Row[] = CHARTS.map((slot) => ({ label: `${mode}: ${slot} on card`, value: contrast(c(slot), c("card")), min: 3 }))
  for (let i = 1; i < CHARTS.length; i++) {
    for (const { name, cvd } of VISION) {
      rows.push({ label: `${mode}: ${CHARTS[i - 1]} vs ${CHARTS[i]} dE ${name}`, value: deltaE(c(CHARTS[i - 1]), c(CHARTS[i]), cvd), min: 10 })
    }
  }
  return rows
}

const field = (ink: InkName) => rgb(rewindInks[ink].field.hex)

/** 4.4: text 7:1 (ink on field, deep on paper, the paper popover) and spots 3:1, on the `rewindInks` hex. */
export function rewindRows(): Row[] {
  const paper = field("paper")
  const deeps = Object.values(archetypeInks).map((a) => rgb(rewindInks[a.deep].deep.hex))
  const rows: Row[] = [{ label: "paper popover: on-paper on paper", value: contrast(rgb(rewindInks.paper.on.hex), paper), min: 7 }]
  for (const [name, ink] of Object.entries(rewindInks)) {
    const f = rgb(ink.field.hex)
    rows.push({ label: `${name}: ink on field`, value: contrast(rgb(ink.on.hex), f), min: 7 })
    rows.push({ label: `${name}: deep on paper`, value: contrast(rgb(ink.deep.hex), paper), min: 7 })
    // paper's spot is the member's archetype deep ink: the worst of them
    const spot =
      ink.spot === "arch-deep"
        ? Math.min(...deeps.map((d) => contrast(d, f)))
        : contrast(ink.spot === "on" ? rgb(ink.on.hex) : field(ink.spot), f)
    rows.push({ label: `${name}: spot (${ink.spot}) vs field`, value: spot, min: 3 })
  }
  for (const [id, a] of Object.entries(archetypeInks)) {
    const spot = a.spot === "own" ? rgb(rewindInks[a.field].on.hex) : field(a.spot)
    rows.push({ label: `${id}: ${a.spot} spot on ${a.field}`, value: contrast(spot, field(a.field)), min: 3 })
  }
  return rows
}

export const failures = (rows: Row[]) => rows.filter((r) => r.value < r.min).map((r) => `${r.label} ${r.value.toFixed(2)} < ${r.min}`)
export const table = (rows: Row[]) => rows.map((r) => `${r.label}: ${r.value.toFixed(2)} (min ${r.min})`)
