import { Fragment, type CSSProperties } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { billedNames, peoplePage } from "@/lib/rewind/pages/people"
import type { PeopleData } from "@/lib/rewind/pages/people.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { headline } from "@/lib/wrapped/copy/templates"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { deckText, type PageProps } from "./issue-context"
import { axes, MEASURE, u, ut } from "./units"

/** Billing names: Archivo width 62, weight 700, in capitals (design 4.3 page 08). */
const NAME_STYLE: CSSProperties = { fontVariationSettings: axes(62, 700), fontSize: u(24), lineHeight: 1.05 }

/** "with A, B and C" as caps names and italic connectors; a name never breaks inside a word. */
function BillingLine({ connector, names, locale, i }: { connector: string; names: readonly string[]; locale: string; i: number }) {
  return (
    <p className="rw-bill-line text-balance" style={{ animationDelay: `${420 + i * 60}ms` }}>
      <span className="font-text italic" style={{ fontSize: ut(15) }}>
        {connector}{" "}
      </span>
      {names.map((name, j) => (
        <Fragment key={`${name}-${j}`}>
          {j > 0 && (
            <span className="font-text italic" style={{ fontSize: ut(15) }}>
              {j === names.length - 1 ? " and " : ", "}
            </span>
          )}
          <span dir="auto" className="font-display hyphens-none" style={NAME_STYLE} data-testid="rewind-people-name">
            {name.toLocaleUpperCase(locale)}
          </span>
        </Fragment>
      ))}
    </p>
  )
}

/**
 * 08 People (design 4.3): "Starring" over the No. 1 actor as a nameplate,
 * then a poster billing block of names only, on paper: the rest of the cast
 * after "with", the directors (films only) after "directed by". No
 * headshots. Screen readers get the block as its summary.
 */
export function PeoplePage({ data, issue }: PageProps<PeopleData>) {
  const { facts, locale } = issue
  const { actors, directors } = billedNames(data, facts)
  const lead = actors[0] ?? directors[0]
  const cast = actors.slice(1)
  const crew = actors.length > 0 ? directors : directors.slice(1)
  const plate = fitLines(lead.toLocaleUpperCase(locale), { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 2, sizeMin: 30, sizeMax: 72 })

  return (
    <div className="flex h-full flex-col text-center font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-people">
      <h2 tabIndex={-1} className="outline-none">
        <span className="block font-lead italic" style={{ fontSize: u(30), lineHeight: 1 }}>
          {actors.length > 0 ? headline("people", facts) : "Directed by"}{" "}
        </span>
        <span className="rw-stretch block" style={{ marginTop: u(6) }}>
          <span className="sr-only">{lead}</span>
          <span aria-hidden>
            <FittedLines fit={plate} weight={900} />
          </span>
        </span>
      </h2>
      <p style={{ fontSize: u(18), lineHeight: 1.3, marginTop: u(12) }}>
        <CopyText text={deckText(issue, "people")} source={facts} />
      </p>
      <RewindFigure summary={peoplePage.srSummary(data, facts)} className="mt-auto flex flex-col" style={{ gap: u(10), paddingTop: u(12) }}>
        {cast.length > 0 && <BillingLine connector="with" names={cast} locale={locale} i={0} />}
        {crew.length > 0 && <BillingLine connector={actors.length > 0 ? "directed by" : "and"} names={crew} locale={locale} i={1} />}
      </RewindFigure>
    </div>
  )
}
