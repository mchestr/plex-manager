/**
 * Compares the token blocks of `app/globals.css` with `lib/design/tokens.ts`
 * and lists every difference, naming the token and both values.
 */
import {
  archetypeInks,
  rewindInks,
  rewindRemap,
  subtleAlpha,
  themes,
  type InkName,
  type ThemeName,
} from "@/lib/design/tokens"

import { archetype, colourTokens, DARK, field, REMAP, resolve, REWIND, ROOT, rule, type Decls } from "./css-tokens"

const SELECTOR: Record<ThemeName, string> = { dark: DARK, light: ROOT }
const INK_NAMES = Object.keys(rewindInks) as InkName[]

/** The app themes as the CSS declares them: token name to `oklch()` string. */
export function cssThemes(css: string): Record<ThemeName, Record<string, string>> {
  return { dark: colourTokens(rule(css, DARK)), light: colourTokens(rule(css, ROOT)) }
}

function diffRecord(label: string, css: Record<string, string>, mirror: Record<string, string>): string[] {
  const out: string[] = []
  for (const name of new Set([...Object.keys(css), ...Object.keys(mirror)])) {
    if (css[name] !== mirror[name]) out.push(`${label} ${name}: globals.css ${css[name] ?? "(missing)"}, tokens.ts ${mirror[name] ?? "(missing)"}`)
  }
  return out
}

const oklchOf = (values: Record<string, { oklch: string }>) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.oklch]))

/** `var(--rw-on-coral)` on coral is `on`; `var(--arch-deep, ...)` is `arch-deep`; `var(--rw-<ink>)` is that ink. */
function spotOf(ink: string, value: string): string {
  if (value === `var(--rw-on-${ink})`) return "on"
  if (value.startsWith("var(--arch-deep")) return "arch-deep"
  return /^var\(--rw-([a-z]+)\)$/.exec(value)?.[1] ?? value
}

function inkDiff(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, " ")
  const declared = [...source.matchAll(/\[data-field="([a-z]+)"\]\s*\{/g)].map((m) => m[1])
  const out = diffRecord("ink", Object.fromEntries(declared.map((n) => [n, n])), Object.fromEntries(INK_NAMES.map((n) => [n, n])))
  const root = rule(css, REWIND)
  for (const ink of INK_NAMES.filter((n) => declared.includes(n))) {
    const raw = rule(css, field(ink))
    const d = resolve(raw, root)
    const mirror = rewindInks[ink]
    out.push(
      ...diffRecord(`ink ${ink}`, {
        field: d["--field"], on: d["--ink"], deep: d["--deep"], spot: spotOf(ink, raw["--spot"]), scheme: d["color-scheme"],
      }, {
        field: mirror.field.oklch, on: mirror.on.oklch, deep: mirror.deep.oklch, spot: mirror.spot, scheme: mirror.scheme,
      }),
    )
  }
  return out
}

const ROLE: Record<string, string> = {
  "var(--field)": "field", "var(--ink)": "ink", "var(--spot)": "spot",
  "var(--rw-paper)": "paper", "var(--rw-on-paper)": "on-paper", transparent: "transparent",
}

/**
 * The remap of every colour the dark theme declares, except `sidebar-*` and
 * the elevations, so a token added to the theme without a remap is reported.
 */
function remapDiff(css: string): string[] {
  const remap: Decls = rule(css, REMAP)
  const fromCss: Record<string, string> = {}
  for (const name of Object.keys(rule(css, DARK)).filter((n) => n.startsWith("--") && !/^--(sidebar|elevation)/.test(n))) {
    const value = remap[name]
    fromCss[name.slice(2)] = value === undefined ? "(not remapped)" : ROLE[value] ?? value
  }
  const mirror = Object.fromEntries(Object.entries(rewindRemap).map(([k, v]) => [k, typeof v === "string" ? v : v.oklch]))
  return diffRecord("remap", fromCss, mirror)
}

function archetypeDiff(css: string): string[] {
  return Object.entries(archetypeInks).flatMap(([id, a]) => {
    const d = rule(css, archetype(id))
    return diffRecord(`archetype ${id}`, {
      field: d["--arch-field"], spot: d["--arch-spot"], deep: d["--arch-deep"],
    }, {
      field: `var(--rw-${a.field})`,
      spot: a.spot === "own" ? `var(--rw-on-${a.field})` : `var(--rw-${a.spot})`,
      deep: `var(--rw-${a.deep}-deep)`,
    })
  })
}

function subtleDiff(css: string): string[] {
  return (Object.keys(SELECTOR) as ThemeName[]).flatMap((mode) => {
    const decls = rule(css, SELECTOR[mode])
    const found = Object.fromEntries(
      ["success", "warning", "info", "destructive"].map((tone) => [tone, decls[`--${tone}-subtle`] ?? "(missing)"]),
    )
    const expected = `${Math.round(subtleAlpha[mode] * 100)}%`
    return diffRecord(`${mode} subtle`, found, Object.fromEntries(
      Object.keys(found).map((tone) => [tone, `color-mix(in oklab, var(--${tone}) ${expected}, transparent)`]),
    ))
  })
}

/** Every difference between the CSS and the mirror; empty when they agree. */
export function syncDiff(css: string): string[] {
  const parsed = cssThemes(css)
  return [
    ...diffRecord("dark", parsed.dark, oklchOf(themes.dark)),
    ...diffRecord("light", parsed.light, oklchOf(themes.light)),
    ...subtleDiff(css),
    ...inkDiff(css),
    ...remapDiff(css),
    ...archetypeDiff(css),
  ]
}
