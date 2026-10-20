import { useId } from "react"

import { METER_CAPTION } from "@/lib/rewind/pages/centrefold"
import type { CentrefoldData, EvidenceGraphic } from "@/lib/rewind/pages/centrefold.schema"
import { num, shown } from "@/lib/rewind/pages/facts"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { calendarDots } from "@/lib/rewind/viz/calendar-dots"
import { meter } from "@/lib/rewind/viz/meter"
import { shelf } from "@/lib/rewind/viz/shelf"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { FittedLines } from "./fitted-lines"
import { HatchDefs } from "./hatch"
import { HourRingFigure } from "./hour-ring-figure"
import { axes, MEASURE, u, ut } from "./units"

/** The ring's box on the centrefold: the bars and arc span 252 of its 256 px (design 4.3). */
const RING = 256
/** The room above the ring for "midnight" and the leader label. */
const RING_TOP = 26
/**
 * The ring's flex basis on the centrefold: its full size and the room above
 * it. The page lets it shrink (`fit`) when the rest of the column needs the
 * height.
 */
export const RING_BASIS = u(RING_TOP + RING)
const METER_H = 28
const DOTS_H = 120
const SHELF_H = 210

const RING_CAPTION: Record<number, string> = {
  22: "started 10\u00A0PM to 4\u00A0AM",
  18: "started 6\u00A0PM to 10\u00A0PM",
}

function MeterGraphic({ graphic, facts }: { graphic: Extract<EvidenceGraphic, { kind: "meter" }>; facts: RewindFactsV3 }) {
  const hatch = useId()
  const m = meter(graphic.ratio, { width: MEASURE, height: METER_H, median: graphic.median })
  return (
    <div aria-hidden className="flex flex-col" style={{ gap: u(8), marginTop: u(28) }}>
      <p className="flex items-baseline" style={{ gap: u(10) }}>
        <b className="font-display tabular-nums" style={{ fontSize: u(64), lineHeight: 0.9, fontVariationSettings: axes(75, 900) }}>
          {shown(facts, graphic.fact)}
        </b>
        <span className="italic" style={{ fontSize: u(17), lineHeight: 1.2 }}>
          {METER_CAPTION[graphic.fact]}
        </span>
      </p>
      <svg viewBox={`0 -6 ${MEASURE} ${METER_H + 12}`} className="block w-full overflow-visible" style={{ height: u(METER_H + 12) }}>
        <HatchDefs id={hatch} />
        <rect className="rw-ring-bar" x={m.rest.x} y={0} width={m.rest.width} height={m.height} fill={`url(#${hatch})`} />
        <rect className="rw-ring-bar fill-chart-2" x={0} y={0} width={m.solid.width} height={m.height} rx={2} />
        {m.tick !== null && <line className="rw-ring-arc" x1={m.tick} x2={m.tick} y1={-6} y2={m.height + 6} stroke="currentColor" strokeWidth={2} />}
      </svg>
      {m.tick !== null && (
        <p className="font-display" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 600) }}>
          The tick is the server&apos;s median.
        </p>
      )}
    </div>
  )
}

function DotsGraphic({ graphic, facts }: { graphic: Extract<EvidenceGraphic, { kind: "calendar-dots" }>; facts: RewindFactsV3 }) {
  const from = facts["window.from"]?.value
  const start = Date.parse(`${typeof from === "string" ? from : "1970-01-01"}T00:00:00Z`)
  const days = graphic.minutes.map((minutes, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), minutes }))
  const { dots } = calendarDots(days, { width: MEASURE, height: DOTS_H, solid: (weekday) => !graphic.weekends || weekday >= 5 })
  return (
    <div aria-hidden style={{ marginTop: u(24) }}>
      <svg viewBox={`0 0 ${MEASURE} ${DOTS_H}`} className="block w-full" style={{ height: u(DOTS_H) }}>
        {dots.map((dot) => (
          <circle
            key={dot.date}
            className="rw-ring-bar"
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill={dot.step === "outline" ? "none" : "currentColor"}
            stroke="currentColor"
            strokeWidth={dot.step === "outline" ? 1 : 0}
          />
        ))}
      </svg>
      <p className="font-display" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 600), marginTop: u(6) }}>
        {graphic.weekends ? `One dot a day, Monday at the top. Solid: a weekend you pressed play, ${shown(facts, "days.weekendShare")} of your plays.` : `One dot a day. Solid: the ${shown(facts, "days.active")} days you pressed play.`}
      </p>
    </div>
  )
}

function ShelfGraphic({ graphic, facts }: { graphic: Extract<EvidenceGraphic, { kind: "shelf" }>; facts: RewindFactsV3 }) {
  const spines = shelf(
    graphic.spines.map((s) => ({ title: shown(facts, s.title), mark: s.mark ? `x${num(facts, s.mark)}` : null })),
    { width: MEASURE, height: SHELF_H, metrics: pageMetrics }
  )
  return (
    <div aria-hidden className="relative border-b-[3px] border-current" style={{ height: u(SHELF_H), marginTop: u(20) }}>
      {spines.map((spine, i) => (
        <div
          key={i}
          className="rw-ring-bar absolute bottom-0 flex flex-col items-center justify-between rounded-t-sm border-[1.5px] border-current"
          style={{ left: u(spine.x), width: u(spine.width), height: u(spine.height), padding: `${u(8)} 0`, animationDelay: `${420 + i * 60}ms` }}
        >
          <span className="flex-1 rotate-180 [writing-mode:vertical-rl]">
            <FittedLines fit={spine.fit} weight={850} lineHeight={1} />
          </span>
          {spine.mark && (
            <b className="font-display tabular-nums" style={{ fontSize: ut(13), fontVariationSettings: axes(62, 900) }}>
              {spine.mark}
            </b>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The archetype's evidence graphic on the centrefold (design 5.3): the hour
 * ring, the meter, the calendar dots or the shelf, from its page data and
 * facts. Decorative: the page wraps it in `RewindFigure`.
 */
export function EvidenceGraphicView({ data, facts }: { data: CentrefoldData; facts: RewindFactsV3 }) {
  const graphic = data.graphic
  if (!graphic) return null
  switch (graphic.kind) {
    case "hour-ring":
      return (
        <div className="flex min-h-0 flex-1 flex-col" style={{ paddingTop: u(RING_TOP) }}>
          <HourRingFigure
            fit
            hours={data.hours}
            arc={graphic.arc}
            peak={typeof facts["hours.peak"]?.value === "number" ? facts["hours.peak"].value : null}
            peakLabel={shown(facts, "hours.peak")}
            share={shown(facts, graphic.share)}
            caption={RING_CAPTION[graphic.arc.from] ?? ""}
            size={RING}
            gutter={(MEASURE - RING) / 2}
            rest="solid"
          />
        </div>
      )
    case "meter":
      return <MeterGraphic graphic={graphic} facts={facts} />
    case "calendar-dots":
      return <DotsGraphic graphic={graphic} facts={facts} />
    case "shelf":
      return <ShelfGraphic graphic={graphic} facts={facts} />
  }
}
