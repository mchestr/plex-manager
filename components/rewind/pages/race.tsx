import { useId } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { frameMonth, racePage } from "@/lib/rewind/pages/race"
import type { RaceData } from "@/lib/rewind/pages/race.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { raceGeometry, type LeadSegment } from "@/lib/rewind/viz/race"
import { renderCopyText } from "@/lib/wrapped/copy/render-copy"
import { headline } from "@/lib/wrapped/copy/templates"

import { FittedLines } from "./fitted-lines"
import { HatchDefs } from "./hatch"
import { SentenceHeadline } from "./headline"
import type { PageProps } from "./issue-context"
import { RaceAnimator } from "./race-animator"
import { axes, MEASURE, u, ut } from "./units"

/** Row pitch in logical px: a two-line title over its bar. */
const PITCH = 56
const STRIP_H = 14

/** A runner's title above its bar, breaking after a colon when it needs two lines. */
const raceTitle = (title: string) =>
  fitLines(title, { role: "sentence", metrics: pageMetrics, weight: 760, measure: MEASURE, maxLines: 2, sizeMin: 15.5, sizeMax: 15.5, widths: [87.5] })

/** Who led each month: solid where the final leader led, an outline where another series did, dashed before anyone started. */
function WhoLed({ data, strip, winner }: { data: RaceData; strip: LeadSegment[]; winner: number }) {
  const id = useId()
  const w = MEASURE / data.frames.length
  const winnerTitle = data.series[winner].title
  return (
    <div aria-hidden style={{ marginTop: u(12) }} data-testid="rewind-race-strip">
      <svg viewBox={`0 0 ${MEASURE} ${STRIP_H}`} className="block w-full" style={{ height: u(STRIP_H) }}>
        <HatchDefs id={id} />
        {strip.map((s) => (
          <rect
            key={s.start}
            x={s.start * w + 1}
            y={0.75}
            width={s.length * w - 2}
            height={STRIP_H - 1.5}
            fill={s.leader === winner ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={s.leader === winner ? 0 : 1.5}
            strokeDasharray={s.leader === null ? "2 2" : undefined}
          />
        ))}
      </svg>
      <div className="grid text-center font-display" style={{ gridTemplateColumns: `repeat(${data.frames.length}, 1fr)`, fontSize: ut(12.5), fontVariationSettings: axes(100, 650), marginTop: u(2) }}>
        {data.frames.map((_f, m) => (
          <span key={m}>{frameMonth(data, m).slice(0, 1)}</span>
        ))}
      </div>
      <p className="flex flex-wrap items-center font-display" style={{ gap: `${u(4)} ${u(12)}`, fontSize: ut(12.5), fontVariationSettings: axes(100, 650), marginTop: u(4) }}>
        <span className="flex min-w-0 items-center" style={{ gap: u(4) }}>
          <span className="inline-block shrink-0 bg-current" style={{ width: u(12), height: u(8) }} />
          <i dir="auto" className="truncate font-text">
            {winnerTitle}
          </i>
        </span>
        <span className="flex items-center" style={{ gap: u(4) }}>
          <span className="inline-block border-[1.5px] border-current" style={{ width: u(12), height: u(8) }} />
          another series
        </span>
      </p>
    </div>
  )
}

/**
 * 11 The race (design 4.3): the race-events headline, the race clock
 * ("Standings after November"), five bars with titles above them (the
 * final leader solid, the rest hatched) and the who-led strip. The client
 * island plays the months once; the server renders the final frame, which
 * is what a revisit, reduced motion and the share card show. P8.3 adds the
 * scrubber (`rewind-race-scrubber`) and replay (`rewind-race-play`) below
 * the strip.
 */
export function RacePage({ data, issue }: PageProps<RaceData>) {
  const { facts, locale } = issue
  const geometry = raceGeometry(data.frames, { pitch: PITCH })
  const winner = geometry.finalOrder[0]
  const rows = data.series.map((series, i) => ({
    key: series.key,
    title: (
      <span dir="auto" className="block">
        <FittedLines fit={raceTitle(series.title)} weight={760} lineHeight={1.05} />
      </span>
    ),
    geometry: geometry.rows[i],
    solid: i === winner,
  }))

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-race">
      <SentenceHeadline text={renderCopyText(headline("race", facts), facts)} />
      <RewindFigure summary={racePage.srSummary(data, facts)} className="mt-auto" style={{ paddingTop: u(10) }}>
        <RaceAnimator rows={rows} months={data.frames.map((_f, m) => frameMonth(data, m, locale))} pitch={PITCH} />
        <WhoLed data={data} strip={geometry.strip} winner={winner} />
      </RewindFigure>
    </div>
  )
}
