/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { hexToRgb, parseOklch, toRgb } from "@/lib/design/color"
import { archetypeInks, inkProps, rewindInks, rewindRemap, themes, type TokenValue } from "@/lib/design/tokens"
import { ARCHETYPE_STYLE, ARCHETYPES } from "@/lib/wrapped/archetypes/catalogue"

import { appRows, chartRows, failures, rewindRows, table } from "./helpers/contrast"
import { DARK, REMAP, rule } from "./helpers/css-tokens"
import { cssThemes, syncDiff } from "./helpers/sync"

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")

describe("lib/design/tokens.ts", () => {
  describe("1. sync with app/globals.css", () => {
    it("declares every token and ink with the same oklch() values", () => {
      expect(syncDiff(CSS)).toEqual([])
    })

    it("keys archetypeInks by the archetype ids, with the catalogue's colourway", () => {
      expect(Object.keys(archetypeInks)).toEqual(ARCHETYPES.map((a) => a.id))
      for (const { id } of ARCHETYPES) {
        const { field, spot } = ARCHETYPE_STYLE[id]
        expect(archetypeInks[id]).toEqual({
          field,
          spot: spot ?? "own",
          // Rewind 5.3: the back cover prints in the field's deep ink; the Curator's field is paper, so ultramarine
          deep: field === "paper" ? "ultramarine" : field,
        })
      }
    })

    it("names a changed token and both of its values", () => {
      const mutated = CSS.replace("--muted-foreground: oklch(76% 0.01 255);", "--muted-foreground: oklch(60% 0.01 255);")
      expect(mutated).not.toBe(CSS)
      expect(syncDiff(mutated)).toEqual([
        "dark muted-foreground: globals.css oklch(60% 0.01 255), tokens.ts oklch(76% 0.01 255)",
      ])
      expect(failures(appRows("dark", cssThemes(mutated).dark))).toContain("dark: muted-foreground on background 4.34 < 4.5")
    })

    it("reports a theme token with no Rewind remap", () => {
      const mutated = CSS.replace("--chart-5: oklch(66% 0.17 355);", "--chart-5: oklch(66% 0.17 355);\n  --chart-6: oklch(60% 0.1 100);")
      expect(syncDiff(mutated)).toEqual(
        expect.arrayContaining(["remap chart-6: globals.css (not remapped), tokens.ts (missing)"]),
      )
    })
  })

  describe("2. hex", () => {
    const values: [string, TokenValue][] = [
      ...Object.entries(themes).flatMap(([mode, t]) => Object.entries(t).map(([k, v]): [string, TokenValue] => [`${mode} ${k}`, v])),
      ...Object.entries(rewindInks).flatMap(([ink, v]) =>
        (["field", "on", "deep"] as const).map((part): [string, TokenValue] => [`${ink} ${part}`, v[part]]),
      ),
      ["rewind overlay", rewindRemap.overlay],
    ]

    it.each(values)("%s converts to its stored hex within 1/255 per channel", (_, { oklch, hex }) => {
      const stored = hexToRgb(hex)
      const computed = toRgb(oklch)
      for (let i = 0; i < 3; i++) expect(Math.abs(stored.rgb[i] - computed[i])).toBeLessThanOrEqual(1 / 255 + 1e-9)
      expect(Math.abs(stored.alpha - parseOklch(oklch).alpha)).toBeLessThanOrEqual(1 / 255 + 1e-9)
    })
  })

  describe("3. app contrast (ui-design-system 3.4)", () => {
    const rows = [...appRows("dark", cssThemes(CSS).dark), ...appRows("light", cssThemes(CSS).light)]

    it("passes every text, badge, fill, alert and non-text pair in both themes", () => {
      expect(failures(rows)).toEqual([])
    })

    it("matches the measured ratios", () => {
      expect(table(rows)).toMatchSnapshot()
    })
  })

  describe("4. Rewind contrast (ui-design-system 4.4, Rewind 5.2 and 5.3)", () => {
    const rows = rewindRows()

    it("prints text at 7:1 and spots at 3:1 on every ink and archetype", () => {
      expect(failures(rows)).toEqual([])
    })

    it("matches the measured ratios", () => {
      expect(table(rows)).toMatchSnapshot()
    })
  })

  describe("5. closing set", () => {
    const remapped = new Set(Object.keys(rule(CSS, REMAP)).map((n) => n.slice(2)))
    const tokens = Object.keys(rule(CSS, DARK))
      .filter((n) => n.startsWith("--"))
      .map((n) => n.slice(2))
      .filter((n) => !n.startsWith("sidebar"))
      .sort((a, b) => b.length - a.length)
    const alternation = tokens.join("|")
    const utility = new RegExp(
      `\\b(?:bg|text|border|ring|outline|fill|stroke|divide|placeholder|shadow)-(${alternation})(?![\\w-])`,
      "g",
    )
    const variable = new RegExp(`\\(--(${alternation})[),]`, "g")
    const dir = join(process.cwd(), "components/ui")
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".tsx") && !f.split("/").includes("__tests__"),
    )

    it("finds the recipes", () => {
      expect(files.length).toBeGreaterThan(0)
    })

    it("declares, in the [data-field] remap, every token a components/ui recipe reads", () => {
      const missing: string[] = []
      for (const file of files) {
        const source = readFileSync(join(dir, file), "utf8")
        for (const [, token] of [...source.matchAll(utility), ...source.matchAll(variable)]) {
          if (!remapped.has(token)) missing.push(`${file}: ${token}`)
        }
      }
      expect(missing).toEqual([])
    })

    it("matches a token, not a longer name that starts with it", () => {
      const found = (s: string) => [...s.matchAll(utility)].map((m) => m[1])
      expect(found("bg-card-foreground text-primary/80 shadow-popover text-h2")).toEqual(["card-foreground", "primary", "popover"])
      expect([..."bg-(--primary-hover) var(--ring)".matchAll(variable)].map((m) => m[1])).toEqual(["primary-hover", "ring"])
    })
  })

  describe("6. charts (ui-design-system 3.5)", () => {
    const rows = [...chartRows("dark"), ...chartRows("light")]

    it("keeps each slot at 3:1 on card and adjacent slots apart under deutan and protan", () => {
      expect(failures(rows)).toEqual([])
    })

    it("matches the measured separations", () => {
      expect(table(rows)).toMatchSnapshot()
    })
  })

  describe("inkProps", () => {
    it("returns the field and its scheme class", () => {
      expect(inkProps("marigold")).toEqual({ "data-field": "marigold", className: "light" })
      expect(inkProps("petrol")).toEqual({ "data-field": "petrol", className: "dark" })
    })

    it("adds the archetype spot and the back-cover ink", () => {
      expect(inkProps("ultramarine", { spot: "arch" })).toEqual({ "data-field": "ultramarine", className: "dark", "data-spot": "arch" })
      expect(inkProps("paper", { ink: "arch-deep" })).toEqual({ "data-field": "paper", className: "light", "data-ink": "arch-deep" })
    })
  })
})
