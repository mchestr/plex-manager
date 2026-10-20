import { lastLead, lifetimeLine, maskedTitle } from "@/lib/rewind/pages/bookends"
import type { BookendsData } from "@/lib/rewind/pages/bookends.schema"
import { shown } from "@/lib/rewind/pages/facts"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { renderCopy } from "@/lib/wrapped/copy/render-copy"
import { copyLocals, headline, tzNote } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { deckText, folioOf, type PageProps } from "./issue-context"
import { axes, MEASURE, u, ut } from "./units"

/** The No. 1 title role (design 5.4): Archivo 900, 34-52 px, up to 3 lines. */
const titleFit = (title: string) => fitLines(title, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 3, sizeMin: 34, sizeMax: 52 })

function BookTitle({ title, masked }: { title: string; masked: boolean }) {
  if (masked) return <span className="block font-lead" style={{ fontSize: u(30), lineHeight: 1.05 }}>{title}</span>
  return <FittedLines fit={titleFit(title)} weight={900} />
}

function When({ facts, side }: { facts: RewindFactsV3; side: "first" | "last" }) {
  return (
    <p className="font-display tabular-nums" style={{ fontSize: ut(14), fontVariationSettings: axes(100, 650), marginTop: u(8) }}>
      {shown(facts, `bookends.${side}.date`)}, {shown(facts, `bookends.${side}.time`)}
    </p>
  )
}

/**
 * 03 Bookends (design 4.3): the year's first play in the headline, the latest
 * (or, after the final cut, the last) below it, each a nameplate title with
 * its date and time, then the deck, the member's lifetime line and the zone
 * note, since the blocks show clock times. A bookend that is the No. 1 series
 * reads "a series you will meet on page 05" instead.
 */
export function BookendsPage({ data, issue }: PageProps<BookendsData>) {
  const { facts, locale } = issue
  const topShows = folioOf(issue, "top-shows") ?? 0
  const title = (side: "first" | "last") => (data[side].masked ? maskedTitle(topShows) : shown(facts, `bookends.${side}.title`))
  const source = { ...facts, ...copyLocals({ year: issue.year, firstTitle: title("first") }) }
  const lifetime = lifetimeLine(facts, locale)

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-bookends">
      <div className="rw-slide-down border-b-[1.5px] border-current" style={{ paddingBottom: u(14) }}>
        <h2 tabIndex={-1} className="outline-none">
          {renderCopy(headline("bookends", facts), source).map((segment, i) =>
            segment.kind === "text" ? (
              <span key={i} className="block font-lead" style={{ fontSize: u(34), lineHeight: 1.05, marginBottom: u(8) }}>
                {segment.text.trim()}{" "}
              </span>
            ) : segment.id === "copy.firstTitle" ? (
              <BookTitle key={i} title={segment.text} masked={data.first.masked} />
            ) : (
              <span key={i}>{segment.text} </span>
            )
          )}
        </h2>
        <When facts={facts} side="first" />
      </div>
      <div className="rw-slide-up border-b-[1.5px] border-current" style={{ padding: `${u(14)} 0` }}>
        <p>
          <span className="block font-lead" style={{ fontSize: u(28), lineHeight: 1.05, marginBottom: u(8) }}>
            {lastLead(facts)}{" "}
          </span>
          <BookTitle title={title("last")} masked={data.last.masked} />
        </p>
        <When facts={facts} side="last" />
      </div>
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(14) }}>
        <CopyText text={deckText(issue, "bookends")} source={facts} />
      </p>
      <div className="mt-auto">
        {lifetime && (
          <p className="font-display" style={{ fontSize: ut(14), fontVariationSettings: axes(100, 650) }} data-testid="rewind-bookends-lifetime">
            {lifetime}
          </p>
        )}
        <p className="italic" style={{ fontSize: ut(13.5), lineHeight: 1.25, marginTop: u(6) }}>
          <CopyText text={tzNote(issue.zone)} source={facts} />
        </p>
      </div>
    </div>
  )
}
