/**
 * The back cover's billing block (design 4.3 page 18, G3): the year set like
 * the credits on a film poster, in capitals with small italic connectors.
 *
 * ```
 *  CHESTER FAMILY PLEX presents MIKE
 *  in 1,307 HOURS of 586 EPISODES
 *  and 112 FILMS featuring
 *  THE LORD OF THE RINGS: THE RINGS OF POWER
 *  with SEVERANCE, SHOGUN and DUNE: PART TWO
 *  showtime 10 PM longest run 23 DAYS standing TOP 3%
 *  and introducing THE MIDNIGHT MARATHONER
 * ```
 *
 * ## Process
 *
 * 1. **Entries.** Each credit the member has is one `{ term, detail }`: the
 *    `<dl>` screen readers get, so the visual block and the list carry the
 *    same content. A missing fact or a zero count drops its credit (RWV-11),
 *    and with it its connector; the showtime appears only when the clock
 *    page is in the issue.
 * 2. **Lines.** The credits fall into the poster's seven lines; a line left
 *    without a credit is dropped, and "featuring" moves down to the title
 *    line when the films line is gone.
 * 3. **Justification.** Each line takes the size at which its capitals
 *    (Archivo width 62, weight 850, from the built metrics) and its
 *    connectors (set at 60% of that size) fill the measure; the renderer
 *    spreads the parts edge to edge. A line with a character outside the
 *    font subset is set in safe mode at 18 px (design 4.9).
 *
 * The in-app page is private, so it names the member; the card version
 * (P5.11) leaves the name out unless the card is signed.
 *
 * @module lib/rewind/billing-block
 */

import { formatCount } from "@/lib/rewind/format"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import { measurer, type FontMetrics } from "@/lib/rewind/typeset/measure"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

export interface BillingEntry {
  term: string
  detail: string
}

interface BillingPart {
  kind: "caps" | "connector"
  text: string
}

export interface BillingLine {
  parts: BillingPart[]
  /** The capitals' size in px; connectors take 60% of it. */
  size: number
  safe: boolean
}

export interface BillingOptions {
  serverName: string
  /** Name the member: in-app, or on a signed card. */
  named: boolean
  /** The clock page is in the issue, so its hour may headline the showtime. */
  showtime: boolean
  locale: string
  measure: number
  metrics: FontMetrics
}

export const CONNECTOR_SCALE = 0.6
const CAPS = { wdth: 62, weight: 850 }
const CONNECTOR = { wdth: 100, weight: 700 }
/** Newsreader italic sets about 12% narrower than Archivo at width 100. */
const ITALIC = 0.88
const SPACE_EM = 0.28
const SIZE_MAX = 34
const SAFE_SIZE = 18

type Credit = { connector: string | null; entry: BillingEntry } | { connector: string; entry: null }

const titles = (facts: RewindFactsV3, ids: FactId[]) => ids.filter((id) => has(facts, id)).map((id) => shown(facts, id))

function credits(facts: RewindFactsV3, opts: BillingOptions): Credit[][] {
  const { locale } = opts
  const credit = (connector: string | null, term: string, detail: string | null | false): Credit[] =>
    detail ? [{ connector, entry: { term, detail } }] : []
  const count = (id: FactId, forms: { one: string; other: string }) => num(facts, id) > 0 && formatCount(num(facts, id), forms, { locale })
  const hours =
    num(facts, "time.totalHours") >= 10
      ? `${shown(facts, "time.totalHours")}\u00A0hours`
      : has(facts, "time.totalMinutes") && shown(facts, "time.totalMinutes")
  const series = titles(facts, ["series[1].title", "series[2].title", "series[3].title"])
  const films = titles(facts, ["films[1].title", "films[2].title", "films[3].title"])
  const [lead, ...others] = series.length > 0 ? series : films
  const film = series.length > 0 ? films[0] : null
  const filmsLine = credit("and", "Films", count("counts.films", { one: "film", other: "films" }))

  return [
    [...credit(null, "Presented by", opts.serverName), ...credit("presents", "Starring", opts.named && shown(facts, "member.firstName"))],
    [...credit("in", "Watch time", hours), ...credit("of", "Episodes", count("counts.episodes", { one: "episode", other: "episodes" }))],
    filmsLine.length > 0 && lead ? [...filmsLine, { connector: "featuring", entry: null }] : filmsLine,
    credit(filmsLine.length > 0 ? null : "featuring", series.length > 0 ? "Top series" : "Top film", lead),
    [...credit("with", "Also featuring", others.length > 0 && others.join(", ")), ...credit(others.length > 0 ? "and" : "with", "Top film", film)],
    [
      ...credit("showtime", "Showtime", opts.showtime && shown(facts, "hours.peak")),
      ...credit("longest run", "Longest run", num(facts, "streak.longest.days") >= 2 && shown(facts, "streak.longest.days")),
      ...credit("standing", "Standing", shown(facts, "standing.percentile")),
    ],
    credit("and introducing", "And introducing", shown(facts, "archetype.name")),
  ]
}

function setLine(credits: Credit[], opts: BillingOptions): BillingLine {
  const m = measurer(opts.metrics)
  const parts = credits.flatMap((c): BillingPart[] => [
    ...(c.connector ? [{ kind: "connector" as const, text: c.connector }] : []),
    ...(c.entry ? [{ kind: "caps" as const, text: c.entry.detail.toLocaleUpperCase(opts.locale) }] : []),
  ])
  if (!parts.every((part) => m.covers(part.text))) return { parts, size: SAFE_SIZE, safe: true }
  const em = parts.reduce(
    (sum, part) =>
      sum +
      (part.kind === "caps"
        ? m.em(part.text, CAPS.wdth, CAPS.weight, 0, true)
        : m.em(part.text, CONNECTOR.wdth, CONNECTOR.weight, 0, false) * ITALIC * CONNECTOR_SCALE),
    SPACE_EM * (parts.length - 1)
  )
  return { parts, size: Math.floor(Math.min(SIZE_MAX, opts.measure / em) * 10) / 10, safe: false }
}

/**
 * The block's credits as a definition list, and its lines.
 */
export function billingBlock(facts: RewindFactsV3, opts: BillingOptions): { entries: BillingEntry[]; lines: BillingLine[] } {
  const lines = credits(facts, opts).filter((line) => line.some((c) => c.entry !== null))
  return {
    entries: lines.flatMap((line) => line.flatMap((c) => (c.entry ? [c.entry] : []))),
    lines: lines.map((line) => setLine(line, opts)),
  }
}
