/**
 * Renders Rewind copy: text with `{{fact:<id>}}` tokens (design 8.3).
 *
 * Numbers and titles enter copy only as tokens, and a token always renders as
 * its fact's `display`, inserted literally. Substitution uses a replacer
 * function, never a replacement string, so a title such as
 * "Ke$ha: My Crazy Beautiful Life" or one containing `$&` or `` $` `` comes
 * out exactly as stored (SEC-46). A display is never scanned for tokens
 * again, so a title that looks like a token stays text.
 *
 * Pure and client-safe: pages render segments, cards and length checks the
 * plain text.
 *
 * @module lib/wrapped/copy/render-copy
 */

import type { FactUnit } from "@/lib/wrapped/facts/display"

/**
 * A token: `{{fact:` then an id of dotted segments, each of which may carry
 * an index (`series[1].title`, `taste.genreByMonth[3]`), then `}}`.
 */
export const TOKEN_RE = /\{\{fact:([A-Za-z][A-Za-z0-9]*(?:\[\d+\])?(?:\.[A-Za-z][A-Za-z0-9]*(?:\[\d+\])?)*)\}\}/g

/**
 * What a token can render: a member's facts, plus any template-only values
 * (`copy.year` and the like) that a template passes beside them.
 */
export type TokenSource = Readonly<Partial<Record<string, { display: string; unit: FactUnit }>>>

export type CopySegment =
  | { kind: "text"; text: string }
  /** A number or other fact, set in `<span class="tok">`. */
  | { kind: "token"; id: string; text: string }
  /** A title, set in italics. */
  | { kind: "title"; id: string; text: string }

/** The fact ids a text's tokens name, in order, repeats included. */
export function tokenIds(text: string): string[] {
  return Array.from(text.matchAll(TOKEN_RE), (m) => m[1])
}

/**
 * Splits copy into text and token segments for React. A token whose fact is
 * missing renders as an empty token; grounding (rule 5) never lets one
 * through, and templates pick only variants whose facts exist.
 *
 * @example
 * ```ts
 * renderCopy("You watched {{fact:series[1].title}} most.", facts)
 * // [{ kind: "text", text: "You watched " }, { kind: "title", id: "series[1].title", text: "Severance" },
 * //  { kind: "text", text: " most." }]
 * ```
 */
export function renderCopy(text: string, facts: TokenSource): CopySegment[] {
  const segments: CopySegment[] = []
  let at = 0
  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index
    if (start > at) segments.push({ kind: "text", text: text.slice(at, start) })
    const id = match[1]
    const fact = facts[id]
    segments.push({ kind: fact?.unit === "title" ? "title" : "token", id, text: fact?.display ?? "" })
    at = start + match[0].length
  }
  if (at < text.length) segments.push({ kind: "text", text: text.slice(at) })
  return segments
}

/**
 * The copy as plain text, for cards, OG text and length checks.
 *
 * @example
 * ```ts
 * renderCopyText("{{fact:series[1].title}} came first.", { "series[1].title": { display: "Ke$ha: $&", unit: "title" } })
 * // "Ke$ha: $& came first."
 * ```
 */
export function renderCopyText(text: string, facts: TokenSource): string {
  return text.replace(TOKEN_RE, (_, id: string) => facts[id]?.display ?? "")
}
