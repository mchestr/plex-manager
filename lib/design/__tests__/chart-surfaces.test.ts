/**
 * @jest-environment node
 *
 * Chart colours on every surface a chart sits on, in both themes (P10.10).
 *
 * P10.9 draws charts in `var(--chart-n)`, so the light theme's own `--chart-*`
 * values in the `:root` block reach them once `<html>` drops `.dark`. P3.3's
 * token test measures each slot on `card`; a chart also sits on the page
 * `background` and in a `popover`, and the "Other" series is
 * `--muted-foreground`. WCAG 2.2 AA 1.4.11 asks 3:1 for each of these marks.
 * Measured on the oklch() values parsed from `app/globals.css`.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { contrast, toRgb } from "@/lib/design/color"
import type { ThemeName } from "@/lib/design/tokens"

import { failures, table, type Row } from "./helpers/contrast"
import { cssThemes } from "./helpers/sync"

const THEMES = cssThemes(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"))
const SLOTS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]
const MARKS = [...SLOTS, "muted-foreground"]
const SURFACES = ["background", "card", "popover"]

function rows(mode: ThemeName): Row[] {
  const c = (name: string) => toRgb(THEMES[mode][name])
  return MARKS.flatMap((mark) =>
    SURFACES.map((bg) => ({ label: `${mode}: ${mark} on ${bg}`, value: contrast(c(mark), c(bg)), min: 3 }))
  )
}

describe("chart colours in both themes", () => {
  const all = [...rows("dark"), ...rows("light")]

  it("gives the light theme its own chart slots", () => {
    for (const slot of SLOTS) expect(THEMES.light[slot]).not.toBe(THEMES.dark[slot])
  })

  it("keeps every series and the Other fold at 3:1 on background, card and popover", () => {
    expect(failures(all)).toEqual([])
  })

  it("matches the measured ratios", () => {
    expect(table(all)).toMatchSnapshot()
  })
})
