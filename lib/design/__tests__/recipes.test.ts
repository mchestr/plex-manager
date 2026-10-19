/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * ui-design-system 3.4: switch tracks, checkbox fills, step segments, progress
 * fills and pips are non-text state marks, so they read `primary-indicator`
 * (3:1 in both themes) and never `primary` (1.79 to 1.98:1 in light).
 */
const RECIPES = ["switch", "checkbox", "slider", "progress", "stepper", "segmented-control"]
const BARE_PRIMARY = /\b(?:bg|border)-primary(?![\w-])/g

const barePrimary = (source: string) => [...source.matchAll(BARE_PRIMARY)].map((m) => m[0])

describe("components/ui state-mark recipes", () => {
  it("flags bg-primary and border-primary, and allows the -indicator, -foreground and -hover tokens", () => {
    expect(barePrimary("data-[checked]:bg-primary border-primary/50")).toEqual(["bg-primary", "border-primary"])
    expect(barePrimary("bg-primary-indicator border-primary-indicator text-primary-foreground hover:bg-primary-hover")).toEqual([])
  })

  it.each(RECIPES)("%s.tsx marks state with primary-indicator", (name) => {
    const path = join(process.cwd(), "components/ui", `${name}.tsx`)
    // P3.5 and P3.7 create the missing recipes; until then they are skipped
    if (!existsSync(path)) return
    expect(barePrimary(readFileSync(path, "utf8"))).toEqual([])
  })
})
