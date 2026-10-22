/**
 * 12 Records card (design 6.4 "records box"): the box score of personal
 * bests, two columns of cells, each a fitted numeral over its label, in the
 * cells the page printed (the projection's `graphic`). The "record" stamp
 * marks the cell furthest above its server median, which the page has only
 * with 10 or more scored members. A hidden title leaves its cell's label.
 *
 * @module lib/rewind/cards/records
 */

import type { ReactElement } from "react"

import type { RecordCell } from "@/lib/rewind/pages/records.schema"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame, type CardInk } from "./frame"
import { CardHeadline, CardTitle } from "./parts"
import { CARD_MEASURE, Line, Text } from "./type"

const CELL_WIDTH = (CARD_MEASURE - 36) / 2

/** Each cell's numeral fact and its label; the binge names its title, when it is published, between "of" and "in a row". */
const CELLS: Record<Exclude<RecordCell, "paused">, { value: FactId; label: string }> = {
  binge: { value: "records.longestBinge.episodes", label: "episodes in a row" },
  day: { value: "records.mostEpisodesDay", label: "episodes in one day" },
  week: { value: "days.biggestWeek", label: "in your biggest week" },
  completion: { value: "records.completionShare", label: "of what you started, finished" },
  latest: { value: "hours.latestStart.time", label: "your latest start" },
}

function Stamp({ ink }: { ink: CardInk }): ReactElement {
  return (
    <div style={{ display: "flex", position: "absolute", right: 16, top: 16, transform: "rotate(-8deg)", border: `4px solid ${ink.spot}`, borderRadius: 6, paddingLeft: 14, paddingRight: 14, color: ink.spot }}>
      <Line text="Record" face={{ wdth: 125, weight: 900, size: 34, measure: 200 }} />
    </div>
  )
}

function Label({ label, title }: { label: string; title: string | null }): ReactElement {
  if (!title) return <Text text={label} family="textItalic" size={42} width={CELL_WIDTH} style={{ marginTop: 18 }} />
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
      <Text text="episodes of" family="textItalic" size={42} />
      <CardTitle text={title} measure={CELL_WIDTH} sizeMin={34} sizeMax={46} />
      <Text text="in a row" family="textItalic" size={42} />
    </div>
  )
}

export function RecordsCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const { page } = input
  const graphic = page.graphic?.kind === "records" ? page.graphic : null
  const binge = page.titleIds.indexOf("records.longestBinge.title")
  const cells = (graphic?.cells ?? []).flatMap((cell) => {
    if (cell === "paused") return []
    const numeral = page.facts[CELLS[cell].value]?.display
    return numeral ? [{ cell, numeral, label: CELLS[cell].label, title: cell === "binge" && binge >= 0 ? page.titles[binge] : null }] : []
  })

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={110} maxLines={2} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", width: CARD_MEASURE, marginTop: 64, borderTop: `3px solid ${ink.on}` }}>
        {cells.map(({ cell, numeral, label, title }, i) => (
          <div
            key={cell}
            style={{
              display: "flex", flexDirection: "column", position: "relative", width: CELL_WIDTH, height: 420, paddingTop: 32,
              marginLeft: i % 2 === 1 ? 36 : 0, borderBottom: `2px solid ${ink.on}`,
            }}
          >
            <Line text={numeral} face={{ wdth: 75, weight: 900, size: 170, measure: CELL_WIDTH }} style={{ lineHeight: "170px" }} />
            <Label label={label} title={title} />
            {graphic?.stamp === cell ? <Stamp ink={ink} /> : null}
          </div>
        ))}
      </div>
    </Frame>
  )
}
