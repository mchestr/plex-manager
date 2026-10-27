import { useId } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { clockPage } from "@/lib/rewind/pages/clock"
import type { ClockData } from "@/lib/rewind/pages/clock.schema"
import { shown } from "@/lib/rewind/pages/facts"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { renderCopy } from "@/lib/wrapped/copy/render-copy"
import { headline } from "@/lib/wrapped/copy/templates"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { HatchDefs } from "./hatch"
import { HourRingFigure, RING_LABEL } from "./hour-ring-figure"
import { deckText, type PageProps } from "./issue-context"
import { axes, MEASURE, u, ut } from "./units"

const RING = 228
const AFTER_DARK = { from: 22, to: 3 }
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]
const ROW_H = 40
const ROW_GAP = 6

/** Seven bars, Monday first, on one scale; the weekend solid, weekdays hatched. They start below the ring's "noon". */
function WeekdayRow({ shares }: { shares: readonly number[] }) {
  const id = useId()
  const max = Math.max(...shares, 0.0001)
  const w = (MEASURE - ROW_GAP * 6) / 7
  return (
    <div aria-hidden style={{ marginTop: `calc(${RING_LABEL} + ${u(6)})` }}>
      <svg viewBox={`0 0 ${MEASURE} ${ROW_H}`} className="block w-full" style={{ height: u(ROW_H) }}>
        <HatchDefs id={id} />
        {shares.map((share, i) => {
          const h = Math.max(2, (share / max) * ROW_H)
          return (
            <rect
              key={i}
              x={i * (w + ROW_GAP)}
              y={ROW_H - h}
              width={w}
              height={h}
              rx={2}
              fill={i >= 5 ? "currentColor" : `url(#${id})`}
              stroke="currentColor"
              strokeWidth={i >= 5 ? 0 : 1.5}
            />
          )
        })}
      </svg>
      <div className="grid grid-cols-7 font-display" style={{ columnGap: u(ROW_GAP), fontSize: ut(12.5), fontVariationSettings: axes(100, 650), marginTop: u(3) }}>
        {WEEKDAYS.map((day, i) => (
          <span key={i} className="text-center">
            {day}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * 09 The clock (design 4.3): "Your hour is 10 PM" with the hour as a
 * nameplate, the deck, the evidence clock with the after-dark window
 * bracketed and its share in the centre, the weekday row (weekends solid)
 * and the zone note, since the page shows clock times.
 */
export function ClockPage({ data, issue }: PageProps<ClockData>) {
  const { facts } = issue

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-clock">
      <h2 tabIndex={-1} className="outline-none">
        {renderCopy(headline("clock", facts), facts).map((segment, i) =>
          segment.kind === "text" ? (
            <span key={i} className="block font-lead" style={{ fontSize: u(36), lineHeight: 1 }}>
              {segment.text.trim()}{" "}
            </span>
          ) : (
            <span key={i} className="rw-stretch block" style={{ marginTop: u(4) }}>
              <FittedLines
                fit={fitLines(segment.text, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 1, sizeMin: 34, sizeMax: 104, tnum: true })}
                weight={900}
                tnum
              />
            </span>
          )
        )}
      </h2>
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(12) }}>
        <CopyText text={deckText(issue, "clock")} source={facts} />
      </p>
      <RewindFigure summary={clockPage.srSummary(data, facts)} className="mt-auto">
        <HourRingFigure
          hours={data.hours}
          arc={AFTER_DARK}
          peak={typeof facts["hours.peak"]?.value === "number" ? facts["hours.peak"].value : null}
          peakLabel={shown(facts, "hours.peak")}
          share={shown(facts, "hours.afterDarkShare")}
          caption={"started 10\u00A0PM to 4\u00A0AM"}
          size={RING}
          gutter={(MEASURE - RING) / 2}
          rest="outline"
        />
        <WeekdayRow shares={data.weekdays} />
      </RewindFigure>
    </div>
  )
}
