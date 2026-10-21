import { useId, type CSSProperties } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { has, shown } from "@/lib/rewind/pages/facts"
import { genreFact, genreMonths, monthGenreFact, tastePage } from "@/lib/rewind/pages/taste"
import type { TasteData } from "@/lib/rewind/pages/taste.schema"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { genreColumn } from "@/lib/rewind/viz/column"
import { decadeStrip } from "@/lib/rewind/viz/decade-strip"
import { renderCopyText } from "@/lib/wrapped/copy/render-copy"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { HatchDefs } from "./hatch"
import { SentenceHeadline } from "./headline"
import { deckText, type PageProps } from "./issue-context"
import { axes, MEASURE, u, ut } from "./units"

const BAR_H = 12
const STRIP_H = 14
const DECADE_H = 16
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

/** One full-width row per genre: name and share over a bar, the top genre solid and the rest hatched. */
function GenreColumn({ data, facts }: { data: TasteData; facts: RewindFactsV3 }) {
  const id = useId()
  const bars = genreColumn(
    data.genres.map((_g, i) => Number(facts[genreFact(i, "share")]?.value ?? 0)),
    { measure: MEASURE }
  )
  return (
    <ol aria-hidden className="flex flex-col" style={{ gap: u(6) }}>
      {bars.map((bar, i) => (
        <li key={`${shown(facts, genreFact(i, "name"))}-${i}`} className="rw-row" style={{ "--rw-i": i } as CSSProperties}>
          <div className="flex items-baseline justify-between font-display" style={{ gap: u(8), fontSize: u(i === 0 ? 20 : 16), fontVariationSettings: axes(87.5, i === 0 ? 850 : 700) }}>
            <span dir="auto" className="min-w-0 truncate">
              {shown(facts, genreFact(i, "name"))}
            </span>
            <span className="tabular-nums">{shown(facts, genreFact(i, "share"))}</span>
          </div>
          <svg viewBox={`0 0 ${MEASURE} ${BAR_H}`} className="block w-full" style={{ height: u(BAR_H), marginTop: u(2) }}>
            {i === 1 && <HatchDefs id={id} />}
            <rect x={0.75} y={0.75} width={Math.max(0.5, bar.width - 1.5)} height={BAR_H - 1.5} fill={bar.solid ? "currentColor" : `url(#${id})`} stroke="currentColor" strokeWidth={bar.solid ? 0 : 1.5} />
          </svg>
        </li>
      ))}
    </ol>
  )
}

/** The 12-cell month strip: solid where the top genre led the month, hatched where another did, an outline where none did. */
function GenreStrip({ facts }: { facts: RewindFactsV3 }) {
  const id = useId()
  const top = shown(facts, genreFact(0, "name"))
  const w = MEASURE / 12
  return (
    <div aria-hidden style={{ marginTop: u(12) }} data-testid="rewind-taste-strip">
      <svg viewBox={`0 0 ${MEASURE} ${STRIP_H}`} className="block w-full" style={{ height: u(STRIP_H) }}>
        <HatchDefs id={id} />
        {MONTH_INITIALS.map((_m, i) => {
          const genre = has(facts, monthGenreFact(i + 1)) ? shown(facts, monthGenreFact(i + 1)) : null
          return (
            <rect
              key={i}
              x={i * w + 1}
              y={0.75}
              width={w - 2}
              height={STRIP_H - 1.5}
              fill={genre === null ? "none" : genre === top ? "currentColor" : `url(#${id})`}
              stroke="currentColor"
              strokeWidth={genre === top ? 0 : 1}
              strokeDasharray={genre === null ? "2 2" : undefined}
            />
          )
        })}
      </svg>
      <div className="grid grid-cols-12 text-center font-display" style={{ fontSize: ut(12.5), fontVariationSettings: axes(100, 650), marginTop: u(2) }}>
        {MONTH_INITIALS.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
    </div>
  )
}

/** The decades as one strip, the median year's decade solid, with the year fitted above its tick. */
function DecadeStrip({ data, facts }: { data: TasteData; facts: RewindFactsV3 }) {
  const id = useId()
  const year = facts["taste.medianYear"]?.value
  const strip = decadeStrip(data.decades, typeof year === "number" ? { year, label: shown(facts, "taste.medianYear") } : null, { width: MEASURE, metrics: pageMetrics })
  if (strip.segments.length === 0) return null
  const marker = strip.marker
  return (
    <div aria-hidden style={{ marginTop: u(14) }} data-testid="rewind-taste-decades">
      {marker && (
        <div className="relative" style={{ height: u(marker.fit.size * 0.9) }}>
          <span
            className="absolute bottom-0 rw-fade"
            style={{ left: `${(Math.min(Math.max(marker.x, 40), MEASURE - 40) / MEASURE) * 100}%`, transform: "translateX(-50%)" }}
          >
            <FittedLines fit={marker.fit} weight={900} tnum />
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${MEASURE} ${DECADE_H + 6}`} className="block w-full" style={{ height: u(DECADE_H + 6) }}>
        <HatchDefs id={id} />
        {strip.segments.map((s) => (
          <rect key={s.decade} x={s.x + 0.75} y={6.75} width={Math.max(0.5, s.width - 1.5)} height={DECADE_H - 1.5} fill={s.median ? "currentColor" : `url(#${id})`} stroke="currentColor" strokeWidth={s.median ? 0 : 1} />
        ))}
        {marker && <line x1={marker.x} x2={marker.x} y1={0} y2={6} stroke="currentColor" strokeWidth={2} />}
      </svg>
      <div className="relative font-display" style={{ height: ut(14), fontSize: ut(12.5), fontVariationSettings: axes(100, 650), marginTop: u(2) }}>
        {strip.segments
          .filter((s) => s.labelled)
          .map((s) => (
            <span key={s.decade} className="absolute text-center" style={{ left: `${(s.x / MEASURE) * 100}%`, width: `${(s.width / MEASURE) * 100}%` }}>
              {s.label}
            </span>
          ))}
      </div>
    </div>
  )
}

/**
 * 07 Taste (design 4.3): "Mostly drama, made around 2022", the deck, then
 * one figure: the genre column, the month strip (when the member has a
 * month genre) and the decade strip with the median year marked.
 */
export function TastePage({ data, issue }: PageProps<TasteData>) {
  const { facts } = issue
  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-taste">
      <SentenceHeadline text={renderCopyText(headline("taste", facts), facts)} />
      <p style={{ fontSize: u(18), lineHeight: 1.3, marginTop: u(8) }}>
        <CopyText text={deckText(issue, "taste")} source={facts} />
      </p>
      <RewindFigure summary={tastePage.srSummary(data, facts)} className="mt-auto" style={{ paddingTop: u(12) }}>
        <GenreColumn data={data} facts={facts} />
        {genreMonths(facts).length > 0 && <GenreStrip facts={facts} />}
        <DecadeStrip data={data} facts={facts} />
      </RewindFigure>
    </div>
  )
}
