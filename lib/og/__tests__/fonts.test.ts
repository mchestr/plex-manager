/**
 * @jest-environment node
 *
 * The committed OG fonts (P3.9, ui-design-system 7.5): inside the 300 KB
 * budget, licensed, and covering the scripts the coverage map claims.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { covers } from "@/lib/og/coverage"
import { loadOgFonts } from "@/lib/og/fonts"

const DIR = path.join(process.cwd(), "lib", "og", "fonts")

describe("lib/og/fonts", () => {
  it("totals less than 300 KB", () => {
    const total = readdirSync(DIR).reduce((sum, file) => sum + statSync(path.join(DIR, file)).size, 0)
    expect(total).toBeLessThan(300 * 1024)
  })

  it("ships the OFL licence and the coverage map beside the fonts", () => {
    expect(readFileSync(path.join(DIR, "OFL.txt"), "utf8")).toContain("SIL Open Font License")
    expect(readdirSync(DIR).sort()).toEqual([
      "OFL.txt", "OgMono-500.ttf", "OgSans-400.ttf", "OgSans-500.ttf", "OgSans-600.ttf", "coverage.json",
    ])
  })

  it("loads four renamed faces, none called Plex (the licence reserves the name)", async () => {
    const fonts = await loadOgFonts()
    expect(fonts.map(({ name, weight }) => `${name} ${weight}`)).toEqual([
      "OG Sans 400", "OG Sans 500", "OG Sans 600", "OG Mono 500",
    ])
    expect(fonts.every((font) => font.data.byteLength > 0)).toBe(true)
  })
})

describe("covers", () => {
  it.each([
    ["Northfield Plex"],
    ["émile Ŝtrażnik"],
    ["Ελληνικά"],
    ["Кинотеатр"],
  ])("draws %p in Sans 600", (text) => {
    expect(covers(text, "OgSans-600")).toBe(true)
  })

  it.each([["東京"], ["مكتبة"], ["עברית"], ["🎬"]])("does not draw %p", (text) => {
    expect(covers(text, "OgSans-600")).toBe(false)
  })

  it("draws a host in Mono 500", () => {
    expect(covers("plex.example.com:3000", "OgMono-500")).toBe(true)
  })
})
