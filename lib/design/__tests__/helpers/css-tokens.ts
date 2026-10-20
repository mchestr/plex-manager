/**
 * A small parser for the token blocks of `app/globals.css`, so the token test
 * can compare the CSS with `lib/design/tokens.ts` and measure the CSS itself.
 * It reads one rule per exact selector; `var()` references resolve within the
 * rule and then through the scopes passed to `resolve`.
 */
export type Decls = Record<string, string>

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, " ")
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The declarations of the one rule whose selector is exactly `selector`. */
export function rule(css: string, selector: string): Decls {
  const source = stripComments(css)
  const matches = [...source.matchAll(new RegExp(`(?:^|[}\\s])${escape(selector)}\\s*\\{([^{}]*)\\}`, "g"))]
  if (matches.length !== 1) throw new Error(`Expected one rule for ${selector}, found ${matches.length}`)
  const decls: Decls = {}
  for (const part of matches[0][1].split(";")) {
    const colon = part.indexOf(":")
    if (colon > 0) decls[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
  }
  return decls
}

/** Replaces each whole-value `var(--name)` with its value from `decls`, then from each scope in turn. */
export function resolve(decls: Decls, ...scopes: Decls[]): Decls {
  const chain = [decls, ...scopes]
  const lookup = (value: string, depth = 0): string => {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(value)
    if (!m || depth > 8) return value
    const found = chain.find((d) => d[m[1]] !== undefined)
    return found ? lookup(found[m[1]], depth + 1) : value
  }
  return Object.fromEntries(Object.entries(decls).map(([k, v]) => [k, lookup(v)]))
}

/** The colour tokens of a theme block: every custom property whose resolved value is an `oklch()` colour. */
export function colourTokens(decls: Decls): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(resolve(decls))) {
    if (name.startsWith("--") && value.startsWith("oklch(")) out[name.slice(2)] = value
  }
  return out
}

export const ROOT = ":root"
export const DARK = ".dark"
export const REWIND = '[data-theme="rewind"]'
export const REMAP = '[data-field]:where([data-theme="rewind"], [data-theme="rewind"] *)'
export const field = (ink: string) => `[data-field="${ink}"]`
export const archetype = (id: string) => `[data-theme="rewind"][data-archetype="${id}"]`
