/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const RAW = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const BLOCK = RAW.slice(RAW.indexOf("/* rewind-scope:start */"), RAW.indexOf("/* rewind-scope:end */")).replace(/\/\*[\s\S]*?\*\//g, "")

/** The body of the Rewind block's reduced-motion media query. */
function reducedMotionRule(): string {
  const start = BLOCK.indexOf("@media (prefers-reduced-motion: reduce)")
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  for (let i = BLOCK.indexOf("{", start); i < BLOCK.length; i++) {
    if (BLOCK[i] === "{") depth++
    else if (BLOCK[i] === "}" && --depth === 0) return BLOCK.slice(start, i + 1)
  }
  throw new Error("unclosed media query")
}

describe("the Rewind reduced-motion rule", () => {
  const rule = reducedMotionRule()

  it("names the Rewind scope and excludes the progress segment", () => {
    expect(rule).toMatch(/\[data-theme="rewind"\] \*\)\s*:not\(\.rw-progress\)/)
    expect(rule).toContain('[data-theme="rewind"] *)::before')
  })

  it("stops animations and keeps only opacity transitions of up to --rw-dur-xs", () => {
    expect(rule).toContain("animation: none !important")
    expect(rule).toContain("transition-property: opacity !important")
    expect(rule).toContain("transition-duration: var(--rw-dur-xs) !important")
    expect(BLOCK).toMatch(/--rw-dur-xs:\s*120ms/)
  })

  it("turns a page with an opacity crossfade only", () => {
    expect(rule).toMatch(/\.rw-page\[data-turn\] \{ animation: rw-fade-in var\(--rw-dur-xs\)/)
    expect(BLOCK).toMatch(/@keyframes rw-fade-in \{ from \{ opacity: 0; \} \}/)
  })
})
