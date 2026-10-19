/**
 * Rewind's typesetter: fits a title or headline to a measure from built font
 * metrics, before rendering, so neither the browser nor Satori re-wraps it.
 *
 * ## Algorithm (design 5.4)
 *
 * 1. **Breaks** fall only between words. A break is preferred after ": ",
 *    after " - " and before " (", and before "of", "the" or "and" when that
 *    keeps the last line from being a single word. Every way of splitting the
 *    words into 1 to `maxLines` lines is tried up to 12 words; longer texts
 *    take one balanced greedy split per line count.
 * 2. **Nameplate** mode sets one size for the block: the largest at which
 *    every line fits at the narrowest width step. Each line then takes the
 *    widest step that still fits, capped at one step wider than the
 *    narrowest line's (the one-step spread rule).
 * 3. **Sentence** mode starts at `sizeMax` and gives every line the widest
 *    shared step at which the longest line fits, flush left. The size shrinks
 *    only when the longest line does not fit at the narrowest step.
 * 4. **Scoring**: size x 0.92 per non-preferred break x 0.85 for a one-word
 *    last line under 6 characters x 0.97 per extra line. Layouts at
 *    `sizeMin` or larger win; failing that, the size may drop to 22 px.
 * 5. **Never break a word.** When nothing fits in `maxLines` lines at that
 *    floor, the last line is cut short with an ellipsis, and `ariaLabel`
 *    keeps the full text.
 *
 * ```
 *  "The Lord of the Rings: The Rings of Power"  (nameplate, 358 px)
 *        ├─ one line ............................ ~25 px   score ~25
 *        ├─ "…the Rings:" / "The Rings of Power"  49.4 px   score 47.9  <- chosen
 *        └─ "The Lord of" / "the Rings:" / ...     52 px    score 45.0
 *           (52 is the role's sizeMax; the break after "of" costs 0.92)
 * ```
 *
 * ## Safe mode
 *
 * Text with a code point outside the font subset (Romanian "ș", Vietnamese,
 * CJK, ...) is not fitted: the result is one line holding the whole text with
 * `safeMode: true`, and the renderer sets it in the system stack with
 * `text-wrap: balance` at `sizeMin` (design 4.9).
 *
 * @example
 * ```ts
 * const fit = fitLines("Midnight Marathoner", {
 *   role: "nameplate", metrics: pageMetrics, weight: 900,
 *   measure: 358, maxLines: 2, sizeMin: 34, sizeMax: 120,
 * })
 * fit.size                        // 87.1
 * fit.lines.map((l) => l.wdth)    // [75, 62]
 * ```
 *
 * @module lib/rewind/typeset/fit-lines
 */

import { measurer, type FontMetrics, type Measurer } from "./measure"

/**
 * Card lines are fitted to the card measure divided by `1 + CARD_SLACK`,
 * because Satori skipped some kerning pairs on 0.15.2. Provisional until
 * P2.14 measures Satori 0.29.
 */
export const CARD_SLACK = 0.015

export interface FitOptions {
  role: "nameplate" | "sentence"
  metrics: FontMetrics
  weight: number
  /** The measure in px. */
  measure: number
  maxLines: number
  sizeMin: number
  sizeMax: number
  /** Allowed width steps; every width the metrics hold at `weight` by default. */
  widths?: readonly number[]
  /** Tabular figures (hero numerals). */
  tnum?: boolean
  /** Letter-spacing in em, applied after every character as CSS does. */
  tracking?: number
}

export interface FitLine {
  text: string
  wdth: number
  /** Rendered width in px at `size`. */
  width: number
}

export interface FitResult {
  size: number
  lines: FitLine[]
  ellipsized: boolean
  ariaLabel: string
  safeMode: boolean
}

const FLOOR = 22
const EXHAUSTIVE_WORDS = 12
const NON_PREFERRED = 0.92
const WIDOW = 0.85
const EXTRA_LINE = 0.97
const FUNCTION_WORDS = new Set(["of", "the", "and"])
const DASHES = new Set(["-", "\u2013", "\u2014"])

interface Setter {
  m: Measurer
  steps: number[]
  opts: FitOptions
  tracking: number
  cache: Map<string, number>
}

const floor1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10

function em(s: Setter, text: string, step: number): number {
  const key = `${step}|${text}`
  let value = s.cache.get(key)
  if (value === undefined) {
    value = s.m.em(text, s.steps[step], s.opts.weight, s.tracking, s.opts.tnum ?? false)
    s.cache.set(key, value)
  }
  return value
}

/** Every split of `words` into 1..maxLines lines (exhaustive), or one greedy split per count. */
function candidates(s: Setter, words: string[]): string[][][] {
  const max = Math.min(s.opts.maxLines, words.length)
  if (words.length <= EXHAUSTIVE_WORDS) {
    const out: string[][][] = []
    const walk = (start: number, lines: string[][]): void => {
      if (start === words.length) out.push(lines)
      else if (lines.length < max) {
        for (let end = start + 1; end <= words.length; end++) walk(end, [...lines, words.slice(start, end)])
      }
    }
    walk(0, [])
    return out
  }
  const total = em(s, words.join(" "), 0)
  return Array.from({ length: max }, (_, k) => {
    const lines: string[][] = [[]]
    const target = total / (k + 1)
    for (const word of words) {
      const line = lines[lines.length - 1]
      const over = line.length > 0 && em(s, [...line, word].join(" "), 0) > target
      if (over && lines.length < k + 1) lines.push([word])
      else line.push(word)
    }
    return lines
  })
}

function preferred(lines: string[][], i: number): boolean {
  const last = lines[i][lines[i].length - 1]
  const next = lines[i + 1]
  if (last.endsWith(":") || DASHES.has(last) || next[0].startsWith("(")) return true
  return FUNCTION_WORDS.has(next[0].toLowerCase()) && i + 1 === lines.length - 1 && next.length > 1
}

function penalty(lines: string[][]): number {
  let p = EXTRA_LINE ** (lines.length - 1)
  for (let i = 0; i < lines.length - 1; i++) if (!preferred(lines, i)) p *= NON_PREFERRED
  const last = lines[lines.length - 1]
  if (lines.length > 1 && last.length === 1 && last[0].length < 6) p *= WIDOW
  return p
}

/** Size and steps for one candidate, in the role's mode. */
function set(s: Setter, texts: string[], sizeLimit: number): { size: number; steps: number[] } {
  const { measure, role } = s.opts
  // Both modes: the largest size at which the longest line fits the narrowest step.
  const size = floor1(Math.min(sizeLimit, measure / Math.max(...texts.map((t) => em(s, t, 0)))))
  const fits = (t: string, step: number) => em(s, t, step) * size <= measure + 1e-6
  const widest = (ok: (step: number) => boolean) => s.steps.reduce((best, _, step) => (ok(step) ? step : best), 0)
  if (role === "nameplate") {
    const steps = texts.map((t) => widest((step) => fits(t, step)))
    const cap = Math.min(...steps) + 1
    return { size, steps: steps.map((step) => Math.min(step, cap)) }
  }
  const shared = widest((step) => texts.every((t) => fits(t, step)))
  return { size, steps: texts.map(() => shared) }
}

function result(s: Setter, texts: string[], layout: { size: number; steps: number[] }, label: string, ellipsized: boolean): FitResult {
  return {
    size: layout.size,
    lines: texts.map((text, i) => ({
      text,
      wdth: s.steps[layout.steps[i]],
      width: Math.round(em(s, text, layout.steps[i]) * layout.size * 100) / 100,
    })),
    ellipsized,
    ariaLabel: label,
    safeMode: false,
  }
}

/** At the floor, fill `maxLines` lines and cut the last one short with "…". */
function ellipsize(s: Setter, words: string[], floor: number, label: string): FitResult {
  const fitsAt = (text: string) => em(s, text, 0) * floor <= s.opts.measure
  const lines: string[] = []
  let rest = [...words]
  while (rest.length > 0 && lines.length < s.opts.maxLines) {
    let take = 1
    while (take < rest.length && fitsAt(rest.slice(0, take + 1).join(" "))) take++
    lines.push(rest.slice(0, take).join(" "))
    rest = rest.slice(take)
  }
  // Everything fitted: only a word wider than the measure got here, and words are never broken.
  if (rest.length === 0) return result(s, lines, set(s, lines, floor), label, false)
  let last = lines[lines.length - 1].split(" ")
  while (last.length > 1 && !fitsAt(`${last.join(" ")}\u2026`)) last = last.slice(0, -1)
  lines[lines.length - 1] = `${last.join(" ")}\u2026`
  return result(s, lines, set(s, lines, floor), label, true)
}

/** Fits `text` to the measure. See the module documentation. */
export function fitLines(text: string, opts: FitOptions): FitResult {
  const label = text.trim().replace(/\s+/g, " ")
  const m = measurer(opts.metrics)
  if (!m.covers(label)) {
    return { size: opts.sizeMin, lines: [{ text: label, wdth: 100, width: 0 }], ellipsized: false, ariaLabel: label, safeMode: true }
  }
  const steps = [...(opts.widths ?? m.widths(opts.weight))].sort((a, b) => a - b)
  const s: Setter = { m, steps, opts, tracking: opts.tracking ?? -0.01, cache: new Map() }
  const words = label.split(" ")
  const floor = Math.min(FLOOR, opts.sizeMin)

  const layouts = candidates(s, words).map((lines) => {
    const texts = lines.map((line) => line.join(" "))
    const layout = set(s, texts, opts.sizeMax)
    return { texts, layout, score: layout.size * penalty(lines) }
  })
  for (const min of [opts.sizeMin, floor]) {
    const best = layouts
      .filter((c) => c.layout.size >= min)
      .reduce<(typeof layouts)[number] | null>((a, b) => (a === null || b.score > a.score + 1e-9 ? b : a), null)
    if (best) return result(s, best.texts, best.layout, label, false)
  }
  return ellipsize(s, words, floor, label)
}
