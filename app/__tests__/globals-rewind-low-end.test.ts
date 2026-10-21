/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const RAW = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const BLOCK = RAW.slice(RAW.indexOf("/* rewind-scope:start */"), RAW.indexOf("/* rewind-scope:end */")).replace(/\/\*[\s\S]*?\*\//g, "")

/** Every `[data-low-end]` rule in the Rewind block, as `selector { body }`. */
const LOW_END_RULES = [...BLOCK.matchAll(/(\[data-low-end\][^{]*)\{([^}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))

/** The properties a keyframes block animates. */
function keyframeProperties(name: string): string[] {
  const match = BLOCK.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?\\})\\s*\\}`))
  expect(match).not.toBeNull()
  return [...match![1].matchAll(/([a-z-]+)\s*:/g)].map(([, property]) => property)
}

describe("the Rewind low-end rules", () => {
  it("swap the nameplate stretch for a 420 ms scaleX from the left edge", () => {
    const stretch = LOW_END_RULES.find((rule) => rule.selector.includes(".rw-stretch"))
    expect(stretch?.body).toContain("animation-name: rw-stretch-low")
    expect(stretch?.body).toContain("animation-duration: var(--rw-dur-m)")
    expect(stretch?.body).toContain("transform-origin: left")
    expect(BLOCK).toMatch(/@keyframes rw-stretch-low \{ from \{ transform: scaleX\(0\.82\); opacity: 0; \} \}/)
    expect(BLOCK).toMatch(/--rw-dur-m:\s*420ms/)
  })

  it("drop the cover's print-in", () => {
    const print = LOW_END_RULES.find((rule) => rule.selector.includes(".rw-print"))
    expect(print?.body).toContain("animation: none")
  })

  it("animate only transform and opacity", () => {
    expect(LOW_END_RULES.length).toBeGreaterThanOrEqual(2)
    const names = LOW_END_RULES.flatMap((rule) => [...rule.body.matchAll(/animation-name:\s*([\w-]+)/g)].map(([, name]) => name))
    expect(names).toEqual(["rw-stretch-low"])
    for (const name of names) expect(new Set(keyframeProperties(name))).toEqual(new Set(["transform", "opacity"]))
    for (const rule of LOW_END_RULES) expect(rule.body).not.toMatch(/transition|font-variation-settings|clip-path/)
  })
})
