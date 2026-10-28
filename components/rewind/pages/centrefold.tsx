import { RewindFigure } from "@/components/rewind/a11y/figure"
import { centrefoldPage, graphicSummary, nameAfterLead, showsRarity, STANDING } from "@/lib/rewind/pages/centrefold"
import type { CentrefoldData } from "@/lib/rewind/pages/centrefold.schema"
import { has, shown } from "@/lib/rewind/pages/facts"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { headline, slotTemplate, whyReasons } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CentrefoldWhy } from "./centrefold-why"
import { CopyText } from "./copy-text"
import { EvidenceGraphicView, RING_BASIS } from "./evidence-graphic"
import { FittedLines } from "./fitted-lines"
import { RING_LABEL } from "./hour-ring-figure"
import type { IssueContext, PageProps } from "./issue-context"
import { axes, MEASURE, u, ut } from "./units"

/** Crop marks in the artboard's corners, 8 px in from its sides and 4 px from its top and foot (`slide-16-centrefold.png`). */
const CROPS = ["left-0 top-0 border-t-[1.5px] border-l-[1.5px]", "right-0 top-0 border-t-[1.5px] border-r-[1.5px]", "bottom-0 left-0 border-b-[1.5px] border-l-[1.5px]", "right-0 bottom-0 border-r-[1.5px] border-b-[1.5px]"]

/**
 * The archetype name as a nameplate (RWV-01): one size for the block, each
 * line within one width step of the others, and never broken inside a word.
 *
 * @internal Exported for the tests.
 */
export function archetypeNameFit(name: string) {
  return fitLines(nameAfterLead(name), { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 3, sizeMin: 40, sizeMax: 120 })
}

/**
 * The ring's key: the arc's swatch and the quietest hour.
 * Other graphics carry their own captions. It starts below the ring's "noon"
 * label, and where its 12 px text floor outgrows the measure (below the 0.8
 * scale floor) it wraps between items, never inside the swatch or the hour.
 */
function KeyRow({ graphic, facts }: { graphic: Extract<CentrefoldData["graphic"], { kind: "hour-ring" }>; facts: RewindFactsV3 }) {
  return (
    <div
      aria-hidden
      className="flex flex-wrap items-center justify-between"
      style={{ columnGap: u(10), rowGap: u(2), fontSize: ut(14), lineHeight: 1.25, marginTop: `calc(${RING_LABEL} + ${u(6)})` }}
    >
      <span className="flex items-center whitespace-nowrap italic" style={{ gap: u(7) }}>
        <i className="inline-block rounded-sm bg-chart-2" style={{ width: u(22), height: u(4) }} />
        {graphic.arc.from === 22 ? "after dark" : "evening"}
      </span>
      {has(facts, "hours.quietest") && (
        <span className="whitespace-nowrap">
          Quietest: <CopyText text="{{fact:hours.quietest}}" source={facts} />
        </span>
      )}
    </div>
  )
}

function Foot({ data, issue }: { data: CentrefoldData; issue: IssueContext }) {
  const { facts } = issue
  const name = shown(facts, "archetype.name")
  const rarity = showsRarity(facts)
  const dedication = issue.copy?.archetype.dedication ?? slotTemplate("archetype.dedication", { facts, userId: issue.userId })

  return (
    <div className="mt-auto flex items-center justify-between border-t-[1.5px] border-current" style={{ gap: u(10), paddingTop: u(10), marginBottom: u(10) }}>
      {rarity && (
        <p
          className="rw-stamp shrink-0 rounded-md border-2 border-current font-display tabular-nums"
          style={{ padding: `${u(5)} ${u(9)} ${u(6)}`, rotate: "-3deg", fontSize: ut(13), lineHeight: 1.15, fontVariationSettings: axes(87.5, 700) }}
          data-testid="rewind-archetype-rarity"
        >
          <b className="block" style={{ fontSize: u(19), fontVariationSettings: axes(75, 900) }}>
            {shown(facts, "archetype.rarityCount")} of {shown(facts, "archetype.scoredMembers")}
          </b>
          Rewinds here
        </p>
      )}
      {has(facts, "archetype.runnerUp") && (
        <p className="flex-1 font-display" style={{ fontSize: ut(13), lineHeight: 1.2, fontVariationSettings: axes(100, 600) }}>
          Close second:{" "}
          <span className="block" style={{ fontVariationSettings: axes(87.5, 800) }}>
            {shown(facts, "archetype.runnerUp")}
          </span>
        </p>
      )}
      {data.shortlist.length > 0 && (
        <CentrefoldWhy
          name={name}
          shortlist={whyReasons(data.shortlist).map((candidate, i) => ({
            id: candidate.id,
            name: candidate.name,
            standing: STANDING[i],
            reasons: candidate.reasons.map((reason, r) => <CopyText key={r} text={reason} source={facts} />),
          }))}
          dedication={<CopyText text={dedication} source={facts} />}
        />
      )}
    </div>
  )
}

/**
 * 16 Centrefold (design 4.3, `slide-16-centrefold.png`): the pull-out
 * poster. Crop marks, "Pull-out poster" and the serial, "You are the" and the
 * archetype name as a nameplate, the tagline, the evidence graphic, its key
 * row, and the foot with the rarity stamp, the runner-up
 * and "Why this?". The stage's bottom chrome adds Table and "Share the
 * poster".
 *
 * Motion: the gatefold's halves part from the centre (700 ms), the name
 * stretches in line by line, the graphic draws and the stamp lands; reduced
 * motion shows the final state.
 */
export function CentrefoldPage({ data, issue }: PageProps<CentrefoldData>) {
  const { facts } = issue
  const name = shown(facts, "archetype.name")
  const tagline = issue.copy?.archetype.tagline ?? slotTemplate("archetype.tagline", { facts, userId: issue.userId })

  return (
    <div className="relative flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} 0` }} data-testid="rewind-page-centrefold">
      {CROPS.map((corner) => (
        <i key={corner} aria-hidden className={`absolute border-current ${corner}`} style={{ width: u(14), height: u(14), margin: `${u(4)} ${u(8)}` }} />
      ))}
      <div className="flex items-baseline justify-between font-display" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 600), marginTop: u(8) }}>
        <span>Pull-out poster</span>
        {has(facts, "member.serial") && <span className="tabular-nums">No. {shown(facts, "member.serial")}</span>}
      </div>
      <h2 tabIndex={-1} className="outline-none">
        <span className="block font-lead" style={{ fontSize: u(38), lineHeight: 1, marginTop: u(8) }}>
          {headline("centrefold", facts)}
        </span>{" "}
        {name ? (
          <span className="rw-stretch block" style={{ marginTop: u(6) }} data-testid="rewind-archetype-name">
            <FittedLines fit={archetypeNameFit(name)} weight={900} lineHeight={0.84} />
          </span>
        ) : (
          <span className="block font-lead" style={{ fontSize: u(38) }}>
            viewer of your own kind
          </span>
        )}
      </h2>
      {name && (
        <p style={{ fontSize: u(21), lineHeight: 1.22, marginTop: u(10) }} data-testid="rewind-archetype-tagline">
          &ldquo;
          <CopyText text={tagline} source={facts} />
          &rdquo;
        </p>
      )}
      {data.graphic && (
        <RewindFigure
          summary={graphicSummary(data.graphic, facts) || centrefoldPage.srSummary(data, facts)}
          // The ring gives way first when the column runs out of height (design 4.7)
          className={data.graphic.kind === "hour-ring" ? "flex min-h-0 flex-col" : undefined}
          style={data.graphic.kind === "hour-ring" ? { flexBasis: RING_BASIS } : undefined}
        >
          <EvidenceGraphicView data={data} facts={facts} />
        </RewindFigure>
      )}
      {data.graphic?.kind === "hour-ring" && <KeyRow graphic={data.graphic} facts={facts} />}
      <Foot data={data} issue={issue} />
      <div aria-hidden className="pointer-events-none absolute inset-0 flex overflow-hidden">
        <div data-side="left" className="rw-gate h-full w-1/2 border-r border-current/40 bg-background" />
        <div data-side="right" className="rw-gate h-full w-1/2 bg-background" />
      </div>
    </div>
  )
}
