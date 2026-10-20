import { pluralWord } from "@/lib/rewind/format"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import { milestoneFacts } from "@/lib/rewind/pages/number"
import type { NumberData } from "@/lib/rewind/pages/number.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { milestoneMarks } from "@/lib/rewind/viz/milestones"
import { yearDays } from "@/lib/rewind/viz/soundtrack"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { deckText, type PageProps } from "./issue-context"
import { NumberSplit } from "./number-split"
import { SoundtrackStrip } from "./soundtrack-strip"
import { axes, MEASURE, u, ut } from "./units"

const COUNTS: ReadonlyArray<[FactId, { one: string; other: string }]> = [
  ["counts.episodes", { one: "episode", other: "episodes" }],
  ["counts.series", { one: "series", other: "series" }],
  ["counts.films", { one: "film", other: "films" }],
]

const ROAD_HEIGHT = 64

/**
 * 02 The number (design 4.3, `slide-02-number.png`): the lead, the hero
 * numeral with its halftone misregistration, "hours", the vs-2025 stamp, the
 * deck, the series and films split, the counts and the road to the total
 * with its milestones. Under 10 hours the numeral is the duration itself
 * ("7 h 20 m", "47 minutes") and "hours" goes. Nothing that would read zero
 * is drawn.
 */
export function NumberPage({ data, issue }: PageProps<NumberData>) {
  const { facts, locale } = issue
  const hero = shown(facts, data.hero)
  const hours = data.hero === "time.totalHours"
  const fit = fitLines(hero, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 1, sizeMin: 34, sizeMax: 185.3, widths: [62, 75], tnum: true })
  const counts = COUNTS.filter(([id]) => num(facts, id) > 0)
  const from = String(facts["window.from"]?.value)
  const marks = milestoneFacts(facts)
  const xs = milestoneMarks(marks.map((m) => m.key), { from, days: yearDays(from), width: MEASURE })
  const finalCut = facts["window.finalCut"]?.value === 1

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} 0` }} data-testid="rewind-page-number">
      <h2 tabIndex={-1} className="relative outline-none">
        <span className="block font-lead" style={{ fontSize: u(36), lineHeight: 1, letterSpacing: "-0.01em" }}>
          {headline("number", facts)}
        </span>{" "}
        <span className="rw-rise relative block" style={{ marginTop: u(10) }} data-testid="rewind-number-hero">
          <span aria-hidden className="rw-halftone absolute inset-0 translate-x-[calc(var(--u)*4px)] translate-y-[calc(var(--u)*4px)]">
            <FittedLines fit={fit} weight={900} tnum />
          </span>
          <FittedLines fit={fit} weight={900} tnum className="relative" />
        </span>
        {hours && (
          <>
            {" "}
            <span className="block font-lead" style={{ fontSize: u(56), lineHeight: 1 }}>
              hours
            </span>
          </>
        )}
      </h2>
      {has(facts, "time.vsLastYear") && (
        <p
          className="rw-stamp absolute flex flex-col items-center rounded-sm border-[1.5px] border-current font-display"
          style={{ right: u(16), top: u(265), padding: `${u(6)} ${u(10)}`, rotate: "-4deg", fontSize: ut(13), lineHeight: 1.15, fontVariationSettings: axes(100, 650) }}
          data-testid="rewind-number-stamp"
        >
          <span style={{ fontSize: u(19), fontVariationSettings: axes(87.5, 850) }}>{shown(facts, "time.vsLastYear")}</span>
          <span>{finalCut ? `on ${issue.year - 1}` : "on the same"}</span>
          {!finalCut && <span>months of {issue.year - 1}</span>}
        </p>
      )}
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(14) }}>
        <CopyText text={deckText(issue, "number")} source={facts} />
      </p>
      <NumberSplit facts={facts} />
      {counts.length > 0 && (
        <dl className="rw-fade grid border-t-[1.5px] border-current" style={{ gridTemplateColumns: `repeat(${counts.length}, 1fr)`, marginTop: u(12) }}>
          {counts.map(([id, forms], i) => (
            <div key={id} className={i > 0 ? "border-l border-current/40" : undefined} style={{ padding: `${u(6)} ${u(10)} 0 ${i > 0 ? u(10) : 0}` }}>
              <dt className="sr-only">{pluralWord(num(facts, id), forms, { locale })}</dt>
              <dd className="flex flex-col">
                <span className="font-display tabular-nums" style={{ fontSize: u(36), lineHeight: 1, fontVariationSettings: axes(75, 900) }}>
                  {shown(facts, id)}
                </span>
                <span aria-hidden style={{ fontSize: u(16) }}>
                  {pluralWord(num(facts, id), forms, { locale })}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-auto" style={{ paddingBottom: u(12) }}>
        <p className="font-display" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 650) }}>
          The road to {hero}
        </p>
        <div aria-hidden className="relative font-display tabular-nums" style={{ height: u(20), fontSize: ut(13), fontVariationSettings: axes(87.5, 760) }}>
          {xs.map(({ x }, i) => (
            <span key={marks[i].key} className="rw-pop absolute bottom-0 -translate-x-1/2" style={{ left: `${(x / MEASURE) * 100}%`, animationDelay: `${1000 + i * 80}ms` }}>
              {marks[i].hours}
            </span>
          ))}
        </div>
        <SoundtrackStrip minutes={data.minutes} from={from} locale={locale} width={MEASURE} height={ROAD_HEIGHT} />
      </div>
    </div>
  )
}
