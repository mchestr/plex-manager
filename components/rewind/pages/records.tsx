import type { CSSProperties } from "react"

import { recordCell } from "@/lib/rewind/pages/records"
import type { RecordsData } from "@/lib/rewind/pages/records.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { headline } from "@/lib/wrapped/copy/templates"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { SentenceHeadline } from "./headline"
import { deckText, type PageProps } from "./issue-context"
import { axes, u, ut } from "./units"

/** A cell's measure: half the artboard's, less the rule and the padding. */
const CELL_MEASURE = 155

/**
 * 12 Records (design 4.3): "Personal bests" over a 2x2 box score with
 * rules, each cell a fitted numeral over its label, on peach in two inks.
 * The "record" stamp marks the cell furthest above the server's median.
 * The box is a definition list: each label is its term, the numeral its
 * detail, so it needs no figure summary (the registry's `srSummary` serves
 * the Notes and article mode).
 */
export function RecordsPage({ data, issue }: PageProps<RecordsData>) {
  const { facts } = issue
  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-records">
      <SentenceHeadline text={headline("records", facts)} />
      <p style={{ fontSize: u(18), lineHeight: 1.3, marginTop: u(8) }}>
        <CopyText text={deckText(issue, "records")} source={facts} />
      </p>
      <dl className="mt-auto grid grid-cols-2 border-t-[1.5px] border-current" data-testid="rewind-records-box">
        {data.cells.map((cell, i) => {
          const { numeral, label } = recordCell(cell, data, facts)
          const fit = fitLines(numeral, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: CELL_MEASURE, maxLines: 1, sizeMin: 28, sizeMax: 60, tnum: true })
          return (
            <div
              key={cell}
              className="rw-stagger relative flex flex-col-reverse justify-end border-b-[1.5px] border-current odd:border-r-[1.5px]"
              style={{ padding: `${u(10)} ${u(8)}`, gap: u(4), minHeight: u(120), "--rw-i": i } as CSSProperties}
              data-testid="rewind-record-cell"
              data-cell={cell}
            >
              <dt style={{ fontSize: ut(14.5), lineHeight: 1.2 }}>
                {label.map((part, j) =>
                  part.title ? (
                    <i key={j} dir="auto">
                      {part.text}
                    </i>
                  ) : (
                    part.text
                  )
                )}
              </dt>
              <dd>
                <FittedLines fit={fit} weight={900} tnum />
                {data.stamp === cell && (
                  <>
                    <span className="sr-only">, a record against the server&apos;s median</span>
                    <span
                      aria-hidden
                      className="rw-stamp absolute top-[calc(var(--u)*6px)] right-[calc(var(--u)*6px)] border-[1.5px] border-current font-display"
                      style={{ fontSize: ut(12.5), padding: `${u(1)} ${u(5)}`, fontVariationSettings: axes(100, 760), rotate: "-6deg" }}
                      data-testid="rewind-record-stamp"
                    >
                      record
                    </span>
                  </>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
