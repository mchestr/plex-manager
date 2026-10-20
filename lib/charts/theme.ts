/**
 * The Chart.js theme (ui-design-system 3.5, UI-24).
 *
 * ## Why hex from `tokens.ts`
 *
 * Chart.js derives hover and border colours through `@kurkle/color`, which
 * cannot parse `oklch()`, and `getComputedStyle` on a custom property returns
 * the declared string. So this module never reads CSS variables: every colour
 * is the hex mirror in `lib/design/tokens.ts`, and the mode is the resolved
 * theme class, which the server passes to the chart island.
 *
 * ## Rules
 *
 * - Series take `chart-1` to `chart-5` in fixed order and are never recoloured
 *   by rank; more than five fold into "Other" (`other`).
 * - Gridlines use `border`, ticks `muted-foreground`, tooltips the popover.
 * - Status colours are never series colours.
 *
 * @example
 * ```ts
 * registerCharts()
 * const theme = chartTheme("dark")
 * theme.series[0]       // "#cb8315" (chart-1)
 * theme.area[0]         // "#cb831529", chart-1 at 16% for a filled line
 * rewindChartTheme("marigold").series[0]  // "#1f1306", the marigold ink
 * ```
 *
 * @module lib/charts/theme
 */

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
} from "chart.js"

import { hex, hexToRgb } from "@/lib/design/color"
import { rewindInks, rewindRemap, themes, type InkName, type ThemeName } from "@/lib/design/tokens"

/**
 * Registers every controller, element, scale and plugin the app's charts
 * use, `Filler` included (without it `fill: true` draws nothing). Safe to
 * call from every chart module.
 */
export function registerCharts(): void {
  Chart.register(
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    DoughnutController,
    Filler,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PieController,
    PointElement,
    Tooltip,
  )
}

export interface ChartTheme {
  /** `chart-1` to `chart-5`, in slot order. */
  series: readonly string[]
  /** Each series at 16%, for the area under a line. */
  area: readonly string[]
  /** The "Other" series past the fifth. */
  other: string
  grid: string
  tick: string
  tooltip: { background: string; text: string; border: string }
}

const AREA_ALPHA = 0.16

const SLOTS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const

function withArea(theme: Omit<ChartTheme, "area">): ChartTheme {
  return { ...theme, area: theme.series.map((colour) => hex(hexToRgb(colour).rgb, AREA_ALPHA)) }
}

/** The app theme's chart colours for `mode`. */
export function chartTheme(mode: ThemeName): ChartTheme {
  const t = themes[mode]
  return withArea({
    series: SLOTS.map((slot) => t[slot].hex),
    other: t["muted-foreground"].hex,
    grid: t.border.hex,
    tick: t["muted-foreground"].hex,
    tooltip: { background: t.popover.hex, text: t["popover-foreground"].hex, border: t["border-strong"].hex },
  })
}

/**
 * A chart inside the Rewind scope, printed in the page's ink: the slots
 * follow the scope's remap (`chart-2` is the spot colour, the rest the ink),
 * and tooltips print on paper.
 *
 * @public Rewind's charts (P5) are its first callers.
 */
export function rewindChartTheme(ink: InkName): ChartTheme {
  const { on, spot } = rewindInks[ink]
  // Paper's spot is the archetype's deep ink, which a chart cannot know; it prints in ink.
  const spotHex = spot === "on" || spot === "arch-deep" ? on.hex : rewindInks[spot].field.hex
  const paper = rewindInks.paper
  return withArea({
    series: SLOTS.map((slot) => (rewindRemap[slot] === "spot" ? spotHex : on.hex)),
    other: on.hex,
    grid: on.hex,
    tick: on.hex,
    tooltip: { background: paper.field.hex, text: paper.on.hex, border: paper.on.hex },
  })
}
