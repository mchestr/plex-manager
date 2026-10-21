import { RewindFigure } from "@/components/rewind/a11y/figure"
import { num } from "@/lib/rewind/pages/facts"
import { COMMUNITY_LABELS, namesPercentile, standingPage } from "@/lib/rewind/pages/standing"
import type { StandingData } from "@/lib/rewind/pages/standing.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { renderCopy } from "@/lib/wrapped/copy/render-copy"
import { headline } from "@/lib/wrapped/copy/templates"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { deckText, type PageProps } from "./issue-context"
import { Ledger } from "./ledger"
import { axes, MEASURE, u, ut } from "./units"

const STRIP_H = 30

/**
 * One mark per member who pressed play, most hours on the left; the member's
 * mark solid, everyone else's an outline. In-app only.
 */
function MemberStrip({ members, rank }: { members: number; rank: number }) {
  const pitch = MEASURE / members
  const width = Math.max(1, pitch * 0.6)
  return (
    <svg viewBox={`0 0 ${MEASURE} ${STRIP_H}`} className="block w-full" style={{ height: u(STRIP_H) }} data-testid="rewind-standing-strip">
      {Array.from({ length: members }, (_, i) => {
        const own = i === rank - 1
        return (
          <rect
            key={i}
            className="rw-ring-bar"
            x={i * pitch + (pitch - width) / 2}
            y={own ? 0 : 6}
            width={width}
            height={own ? STRIP_H : STRIP_H - 12}
            rx={Math.min(2, width / 2)}
            fill={own ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={own ? 0 : Math.min(1.5, width / 3)}
            data-own={own || undefined}
          />
        )
      })}
    </svg>
  )
}

/** "Top 3%" as a nameplate over "by hours watched", or the plain sentence outside the top 50%. */
function Headline({ issue }: Pick<PageProps<StandingData>, "issue">) {
  const { facts } = issue
  const text = headline("standing", facts)
  if (!namesPercentile(facts)) {
    return (
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(34), lineHeight: 1.05 }}>
        <CopyText text={text} source={facts} />
      </h2>
    )
  }
  return (
    <h2 tabIndex={-1} className="outline-none">
      {renderCopy(text, facts).map((segment, i) =>
        segment.kind === "text" ? (
          <span key={i} className="block font-lead" style={{ fontSize: u(30), lineHeight: 1.05, marginTop: u(6) }}>
            {segment.text.trim()}
          </span>
        ) : (
          <span key={i} className="rw-stretch block">
            <FittedLines
              fit={fitLines(segment.text, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 1, sizeMin: 40, sizeMax: 120, tnum: true })}
              weight={900}
              tnum
            />{" "}
          </span>
        )
      )}
    </h2>
  )
}

/**
 * 15 Standing (design 4.3): the headline, the member strip, the deck and the
 * community box. The strip and "one of 34" stay in the story; the card
 * prints only the percentile, and only at top 25% or better.
 */
export function StandingPage({ data, issue }: PageProps<StandingData>) {
  const { facts } = issue
  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-standing">
      <Headline issue={issue} />
      <RewindFigure summary={standingPage.srSummary(data, facts)} style={{ marginTop: u(18) }}>
        <div aria-hidden>
          <MemberStrip members={num(facts, "standing.members")} rank={data.rank} />
          <p className="font-display" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 600), marginTop: u(6) }}>
            One mark per member, most hours first. Yours is solid.
          </p>
        </div>
      </RewindFigure>
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(14) }}>
        <CopyText text={deckText(issue, "standing")} source={facts} />
      </p>
      {data.community.length > 0 && (
        <section className="mt-auto border-[1.5px] border-current" style={{ padding: `${u(10)} ${u(12)}`, fontSize: u(16) }} aria-labelledby="rewind-standing-community">
          <h3 id="rewind-standing-community" className="font-display" style={{ fontSize: ut(14), fontVariationSettings: axes(100, 760), marginBottom: u(8) }}>
            On the server this year
          </h3>
          <Ledger
            testId="rewind-standing-box"
            className="font-text"
            rows={data.community.map((id) => ({ key: id, label: COMMUNITY_LABELS[id], value: <CopyText text={`{{fact:${id}}}`} source={facts} /> }))}
          />
        </section>
      )}
    </div>
  )
}
