/**
 * 14 Requests card (design 6.4): counts only, never a request's title. The
 * card headline, then how many the member asked for, how many were
 * approved, arrived on the server and were watched.
 *
 * @module lib/rewind/cards/requests
 */

import type { ReactElement } from "react"

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { CardHeadline } from "./parts"
import { CARD_MEASURE, Line, Text } from "./type"

const ROWS: ReadonlyArray<{ id: FactId; label: string }> = [
  { id: "requests.made", label: "asked for" },
  { id: "requests.approved", label: "approved" },
  { id: "requests.available", label: "now on the server" },
  { id: "requests.watched", label: "watched" },
]

export function RequestsCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const rows = ROWS.flatMap(({ id, label }) => {
    const value = input.page.facts[id]?.display
    return value ? [{ id, label, value }] : []
  })

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={96} maxLines={3} />
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", width: CARD_MEASURE }}>
        {rows.map((row, i) => (
          <div key={row.id} style={{ display: "flex", alignItems: "baseline", borderTop: `${i === 0 ? 3 : 2}px solid ${ink.on}`, paddingTop: 20, paddingBottom: 20 }}>
            <Line text={row.value} face={{ wdth: 75, weight: 900, size: i === 0 ? 180 : 120, measure: 360 }} style={{ width: 380 }} />
            <Text text={row.label} family="display" size={i === 0 ? 64 : 52} />
          </div>
        ))}
      </div>
    </Frame>
  )
}
