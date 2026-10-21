/**
 * 07 Taste card (design 6.4 "genre column"): the card headline and the
 * genre column from `lib/rewind/viz/column`, one row per genre with its
 * share, the top genre solid and the rest hatched, then the median year.
 * The bar lengths come from the projection's `graphic`; every number the
 * card prints is a published fact.
 *
 * @module lib/rewind/cards/taste
 */

import type { ReactElement } from "react"

import { genreColumn } from "@/lib/rewind/viz/column"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { Bar, CardHeadline, LABEL } from "./parts"
import { CARD_MEASURE, Line } from "./type"

const genre = (i: number, field: "name" | "share") => `taste.genre[${i + 1}].${field}` as FactId

export function TasteCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const { facts, graphic } = input.page
  const bars = graphic?.kind === "bars" ? graphic.bars : []
  const column = genreColumn(bars, { measure: CARD_MEASURE })
  const rows = column.flatMap((bar, i) => {
    const name = facts[genre(i, "name")]?.display
    return name ? [{ bar, name, share: facts[genre(i, "share")]?.display ?? "" }] : []
  })
  const median = facts["taste.medianYear"]?.display

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={96} maxLines={3} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 56, width: CARD_MEASURE }}>
        {rows.map((row, i) => (
          <div key={row.name} style={{ display: "flex", flexDirection: "column", marginTop: i === 0 ? 0 : 30 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
              <Line text={row.name} face={{ wdth: 87.5, weight: 700, size: i === 0 ? 64 : 52, measure: CARD_MEASURE - 220 }} />
              {row.share ? <Line text={row.share} face={{ wdth: 75, weight: 900, size: i === 0 ? 64 : 52, measure: 200 }} /> : null}
            </div>
            <Bar width={Math.round(row.bar.width)} height={i === 0 ? 48 : 36} ink={ink.on} solid={row.bar.solid} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      {median ? <Line text={`The median title was made in ${median}`} face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} /> : null}
    </Frame>
  )
}
