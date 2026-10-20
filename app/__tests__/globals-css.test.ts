/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { registry } from "@/lib/rewind/registry"
import { ARCHETYPE_STYLE, ARCHETYPES } from "@/lib/wrapped/archetypes/catalogue"

const RAW = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const START = "/* rewind-scope:start */"
const END = "/* rewind-scope:end */"
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length))
/** Comment-free, with offsets kept, so indexes in RAW and CSS agree. */
const CSS = stripComments(RAW)

const LIGHT_INKS = ["paper", "coral", "marigold", "rose", "sky", "peach", "lilac", "mint"]
const DARK_INKS = ["ultramarine", "forest", "oxblood", "petrol"]
const INKS = [...LIGHT_INKS, ...DARK_INKS]

/** Brace depth at an offset of the comment-free source. */
function depthAt(index: number): number {
  let depth = 0
  for (let i = 0; i < index; i++) {
    if (CSS[i] === "{") depth++
    else if (CSS[i] === "}") depth--
  }
  return depth
}

/** The declarations of the one rule whose selector is exactly `selector`. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const matches = [...CSS.matchAll(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "g"))]
  expect(matches).toHaveLength(1)
  return Object.fromEntries(
    matches[0][1]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const colon = d.indexOf(":")
        return [d.slice(0, colon).trim(), d.slice(colon + 1).trim()]
      }),
  )
}

function rewindBlock(): { start: number; end: number; body: string } {
  const start = RAW.indexOf(START)
  const end = RAW.indexOf(END)
  return { start, end, body: CSS.slice(start, end) }
}

describe("app/globals.css", () => {
  it("drops the body-scroller height rule and the decorative loops", () => {
    expect(CSS).not.toMatch(/height:\s*100%/)
    expect(CSS).not.toMatch(/overflow-x:\s*hidden/)
    expect(CSS).not.toMatch(/@supports\s*\(height:\s*100dvh\)/)
    for (const name of ["float", "wiggle", "twinkle", "blink", "gradient-shift"]) {
      expect(CSS).not.toMatch(new RegExp(`@keyframes\\s+${name}\\b`))
      expect(CSS).not.toMatch(new RegExp(`--animate-${name}\\b`))
    }
  })

  it("keeps the one-shot fade-in and the v2 grain", () => {
    expect(CSS).toMatch(/@keyframes\s+fade-in\b/)
    expect(CSS).toMatch(/@keyframes\s+grain\b/)
  })

  it("replaces the cinematic colours with aliases marked for P11.29", () => {
    expect(CSS).not.toMatch(/#(?:0a0908|16120e|d4af37|f5d67b|ece5d8|9a9082)\b/i)
    const marker = RAW.indexOf("/* temporary cinematic aliases: delete in P11.29 */")
    expect(marker).toBeGreaterThan(-1)
    const block = CSS.slice(marker, CSS.indexOf("}", marker))
    expect(block).toMatch(/^\s*@theme inline\s*\{/)
    for (const [alias, token] of [
      ["stage", "background"],
      ["stage-panel", "card"],
      ["gold", "primary"],
      ["gold-bright", "primary-hover"],
      ["ivory", "foreground"],
      ["taupe", "muted-foreground"],
    ]) {
      expect(block).toContain(`--color-${alias}: var(--${token});`)
    }
  })

  it("uses the bounded dark variant", () => {
    expect(CSS).toContain("@custom-variant dark (&:where(.dark, .dark *):not(:where(.light, .light *)));")
  })

  it("keeps :root, .dark and the Rewind block unlayered, in that order", () => {
    const root = CSS.search(/(?:^|\n):root\s*\{/)
    const dark = CSS.search(/(?:^|\n)\.dark\s*\{/)
    const { start, end } = rewindBlock()
    expect(root).toBeGreaterThan(-1)
    expect(root).toBeLessThan(dark)
    expect(dark).toBeLessThan(start)
    expect(start).toBeLessThan(end)
    for (const index of [root, dark, start, end]) expect(depthAt(index)).toBe(0)
    expect(RAW.split(START)).toHaveLength(2)
    expect(RAW.split(END)).toHaveLength(2)
  })

  it("keeps every Rewind-only name between the markers", () => {
    const { start, end } = rewindBlock()
    const outside = CSS.slice(0, start) + CSS.slice(end)
    expect(outside).not.toMatch(/--(?:rw-|field\b|ink\b|spot\b|deep\b|arch-|font-display\b|font-text\b|font-lead\b)/)
    expect(outside).not.toMatch(/@utility\s+font-(?:display|text|lead)\b/)
  })

  it("declares a field, ink and deep ink for each of the twelve inks", () => {
    const root = rule('[data-theme="rewind"]')
    for (const ink of INKS) {
      expect(root[`--rw-${ink}`]).toMatch(/^oklch\(/)
      expect(root[`--rw-on-${ink}`]).toBeDefined()
      expect(root[`--rw-${ink}-deep`]).toBeDefined()
    }
    for (const ink of DARK_INKS) expect(root[`--rw-${ink}-deep`]).toBe(`var(--rw-${ink})`)
    expect(root["font-family"]).toBe("var(--font-text)")
    // the variables app/(app)/rewind/fonts.ts defines (P5.1)
    expect(root["--font-display"]).toBe("var(--font-rw-archivo)")
    expect(root["--font-lead"]).toBe("var(--font-rw-newsreader-display)")
    const fonts = readFileSync(join(process.cwd(), "app/(app)/rewind/fonts.ts"), "utf8")
    for (const name of new Set(CSS.match(/--font-rw-[a-z-]+/g))) expect(fonts).toContain(`variable: "${name}"`)
  })

  it("gives each ink its scheme, and light and dark inks no other", () => {
    for (const ink of INKS) {
      const decls = rule(`[data-field="${ink}"]`)
      expect(decls["--field"]).toBe(`var(--rw-${ink})`)
      expect(decls["--ink"]).toBe(`var(--rw-on-${ink})`)
      expect(decls["--deep"]).toBe(`var(--rw-${ink}-deep)`)
      expect(decls["color-scheme"]).toBe(LIGHT_INKS.includes(ink) ? "light" : "dark")
    }
    expect(rule('[data-field="paper"]')["--spot"]).toBe("var(--arch-deep, var(--rw-ultramarine))")
    expect(rule('[data-field="ultramarine"]')["--spot"]).toBe("var(--rw-marigold)")
  })

  it("names every ink the page registry prints in", () => {
    for (const page of Object.values(registry)) {
      for (const field of [page.field, page.altField]) {
        if (field && field !== "archetype") expect(INKS).toContain(field)
      }
    }
  })

  it("writes one data-archetype rule per archetype, matching its colourway", () => {
    const ids = [...CSS.matchAll(/\[data-theme="rewind"\]\[data-archetype="([a-z-]+)"\]/g)].map((m) => m[1])
    expect(ids).toEqual(ARCHETYPES.map((a) => a.id))
    for (const { id } of ARCHETYPES) {
      const { field, spot } = ARCHETYPE_STYLE[id]
      const decls = rule(`[data-theme="rewind"][data-archetype="${id}"]`)
      expect(decls["--arch-field"]).toBe(`var(--rw-${field})`)
      expect(decls["--arch-spot"]).toBe(spot ? `var(--rw-${spot})` : `var(--rw-on-${field})`)
      // Rewind 5.3: the back cover prints in the field's deep ink; the Curator's field is paper, so ultramarine
      expect(decls["--arch-deep"]).toBe(`var(--rw-${field === "paper" ? "ultramarine" : field}-deep)`)
    }
  })

  it("remaps every app colour token on [data-field], so no graphite leaks into Rewind", () => {
    const remap = rule('[data-field]:where([data-theme="rewind"], [data-theme="rewind"] *)')
    const mapped = [...CSS.matchAll(/--color-([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)]
      .filter(([, name, token]) => name === token && !name.startsWith("sidebar"))
      .map(([, name]) => name)
    expect(mapped).toHaveLength(40)
    for (const token of mapped) expect(remap[`--${token}`]).toBeDefined()
    for (const token of ["radius", "focus-width", "focus-offset", "elevation-popover", "elevation-dialog", "elevation-poster"]) {
      expect(remap[`--${token}`]).toBeDefined()
    }
    for (const tone of ["success", "warning", "info", "destructive"]) {
      expect(remap[`--${tone}`]).toBe("var(--ink)")
      expect(remap[`--${tone}-foreground`]).toBe("var(--field)")
      expect(remap[`--${tone}-subtle`]).toBe("transparent")
    }
  })

  it("skips spinners and the Rewind scope in the reduced-motion clamp", () => {
    // The base layer's clamp; the Rewind block's own rule comes earlier (globals-rewind-motion.test.ts).
    const media = CSS.indexOf("@media (prefers-reduced-motion: reduce)", CSS.indexOf("@layer base"))
    expect(media).toBeGreaterThan(-1)
    const block = CSS.slice(media, CSS.indexOf("}", media))
    expect(block).toContain('[data-slot="spinner"]')
    expect(block).toContain('[data-theme="rewind"]')
    expect(block).toContain("animation-duration: 0.01ms !important")
  })
})
