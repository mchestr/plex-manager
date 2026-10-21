/**
 * 11 The race card (design 6.4 "final standings"): the static final frame.
 * The card headline, then each runner in final standing with its bar
 * against the winner's (from the projection's `graphic`) and its minutes,
 * and how many times the lead changed. A hidden runner is not in the
 * projection, so its row is not drawn.
 *
 * @module lib/rewind/cards/race
 */

import type { ReactElement } from "react"

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { Bar, CardHeadline, CardTitle, countOf, LABEL } from "./parts"
import { rankOf } from "./top-shows"
import { CARD_MEASURE, Line } from "./type"

const NUMBER_WIDTH = 80

export function RaceCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const { page } = input
  const bars = page.graphic?.kind === "bars" ? page.graphic.bars : []
  const rows = page.titleIds.flatMap((id, i) => {
    const rank = rankOf(id, i + 1)
    return rank <= bars.length ? [{ id, rank, title: page.titles[i], bar: bars[rank - 1], minutes: page.facts[id.replace(/\.title$/, ".minutes") as FactId]?.display ?? "" }] : []
  })
  const changes = page.facts["race.leadChanges"]?.display
  const width = CARD_MEASURE - NUMBER_WIDTH

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={96} maxLines={3} />
      </div>
      <Line text="Final standings" face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} style={{ marginTop: 56 }} />
      <div style={{ display: "flex", flexDirection: "column", width: CARD_MEASURE, marginTop: 12 }}>
        {rows.map((row, i) => (
          <div key={row.id} style={{ display: "flex", borderTop: `2px solid ${ink.on}`, paddingTop: 18, paddingBottom: 18 }}>
            <Line text={String(row.rank)} face={{ wdth: 75, weight: 900, size: 53, measure: NUMBER_WIDTH }} style={{ width: NUMBER_WIDTH }} />
            <div style={{ display: "flex", flexDirection: "column", width }}>
              <CardTitle text={row.title} measure={width} sizeMin={40} sizeMax={i === 0 ? 60 : 50} />
              <div style={{ display: "flex", marginTop: 12 }}>
                <Bar width={Math.max(4, Math.round(row.bar * width))} height={28} ink={ink.on} solid={row.rank === 1} />
              </div>
              {row.minutes ? <Line text={row.minutes} face={{ ...LABEL, size: 30, measure: width }} style={{ marginTop: 8 }} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      {changes ? (
        <Line text={countOf(changes) === 0 ? "The lead never changed hands" : `The lead changed hands ${countOf(changes) === 1 ? "once" : `${changes} times`}`} face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} />
      ) : null}
    </Frame>
  )
}
