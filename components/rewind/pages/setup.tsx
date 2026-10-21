import { useId } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import { METER_LABELS, setupPage } from "@/lib/rewind/pages/setup"
import type { SetupData } from "@/lib/rewind/pages/setup.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { meter } from "@/lib/rewind/viz/meter"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { HatchDefs } from "./hatch"
import type { PageProps } from "./issue-context"
import { axes, MEASURE, u, ut } from "./units"

const METER_H = 22

/** One share as the meter graphic: the member's share solid, the rest hatched. */
function SetupMeter({ id, facts }: { id: SetupData["meters"][number]; facts: RewindFactsV3 }) {
  const hatch = useId()
  const m = meter(num(facts, id), { width: MEASURE, height: METER_H, median: null })
  return (
    <div className="flex flex-col" style={{ gap: u(6) }}>
      <p className="flex items-baseline" style={{ gap: u(8) }}>
        <b className="font-display tabular-nums" style={{ fontSize: u(40), lineHeight: 0.9, fontVariationSettings: axes(75, 900) }}>
          {shown(facts, id)}
        </b>
        <span className="italic" style={{ fontSize: ut(16), lineHeight: 1.2 }}>
          {METER_LABELS[id]}
        </span>
      </p>
      <svg viewBox={`0 0 ${MEASURE} ${METER_H}`} className="block w-full" style={{ height: u(METER_H) }}>
        <HatchDefs id={hatch} />
        <rect className="rw-ring-bar" x={m.rest.x} y={0} width={m.rest.width} height={m.height} fill={`url(#${hatch})`} />
        <rect className="rw-ring-bar" x={0} y={0} width={m.solid.width} height={m.height} rx={2} fill="currentColor" />
      </svg>
    </div>
  )
}

/**
 * 13 Setup (design 4.3, D5): the template headline, the top platform as a
 * nameplate with the top app beneath it, then one meter per share. No deck:
 * the page's copy is template only.
 */
export function SetupPage({ data, issue }: PageProps<SetupData>) {
  const { facts } = issue
  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-setup">
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(34), lineHeight: 1.05 }}>
        <CopyText text={headline("setup", facts)} source={facts} />
      </h2>
      {has(facts, "setup.topPlatform") && (
        <div className="rw-slide-up border-y-[1.5px] border-current" style={{ marginTop: u(18), padding: `${u(10)} 0` }} data-testid="rewind-setup-platform">
          <p className="italic" style={{ fontSize: ut(15), marginBottom: u(4) }}>
            Mostly watched on
          </p>
          <span className="rw-stretch block">
            <FittedLines
              fit={fitLines(shown(facts, "setup.topPlatform"), { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 2, sizeMin: 34, sizeMax: 88 })}
              weight={900}
            />
          </span>
          {has(facts, "setup.topProduct") && (
            <p className="font-display" style={{ fontSize: ut(14), fontVariationSettings: axes(100, 650), marginTop: u(8) }}>
              in {shown(facts, "setup.topProduct")}
            </p>
          )}
        </div>
      )}
      {data.meters.length > 0 && (
        <RewindFigure summary={setupPage.srSummary(data, facts)} className="mt-auto">
          <div aria-hidden className="flex flex-col" style={{ gap: u(16) }}>
            {data.meters.map((id) => (
              <SetupMeter key={id} id={id} facts={facts} />
            ))}
          </div>
        </RewindFigure>
      )}
    </div>
  )
}
