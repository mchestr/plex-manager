import { RewindFigure } from "@/components/rewind/a11y/figure"
import { shown } from "@/lib/rewind/pages/facts"
import { LEDGER_LABELS, requestsPage } from "@/lib/rewind/pages/requests"
import type { RequestsData } from "@/lib/rewind/pages/requests.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { headline } from "@/lib/wrapped/copy/templates"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { deckText, type PageProps } from "./issue-context"
import { Ledger } from "./ledger"
import { axes, MEASURE, u, ut } from "./units"

const TOTAL_LABEL = "Asked for"

/**
 * 14 Requests (design 4.3): the headline, the deck, then a receipt: one line
 * per count with dotted leaders, printing from the top, and the fitted total
 * under a double rule. Counts only; no request title is ever shown.
 */
export function RequestsPage({ data, issue }: PageProps<RequestsData>) {
  const { facts } = issue
  const total = fitLines(shown(facts, "requests.made"), { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE * 0.6, maxLines: 1, sizeMin: 40, sizeMax: 96, tnum: true })

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-requests">
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(34), lineHeight: 1.05 }}>
        <CopyText text={headline("requests", facts)} source={facts} />
      </h2>
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(12) }}>
        <CopyText text={deckText(issue, "requests")} source={facts} />
      </p>
      <RewindFigure summary={requestsPage.srSummary(data, facts)} className="mt-auto">
        <div aria-hidden className="border-t-2 border-dashed border-current" style={{ paddingTop: u(14), fontSize: u(17) }}>
          <Ledger
            testId="rewind-requests-ledger"
            className="font-display"
            rows={data.lines.map((id) => ({
              key: id,
              label: LEDGER_LABELS[id],
              value: <span className="tabular-nums">{shown(facts, id)}</span>,
            }))}
          />
          <div className="flex items-end justify-between border-t-[4px] border-double border-current" style={{ marginTop: u(14), paddingTop: u(8) }}>
            <span className="font-display" style={{ fontSize: ut(15), fontVariationSettings: axes(100, 760) }}>
              {TOTAL_LABEL}
            </span>
            <FittedLines fit={total} weight={900} tnum />
          </div>
        </div>
      </RewindFigure>
    </div>
  )
}
