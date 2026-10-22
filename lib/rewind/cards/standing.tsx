/**
 * 15 Standing card (design 6.4 "percentile"): the member's percentile as a
 * nameplate, and only as a percentage. The projection prints the
 * percentile only at top 25% or better, and the card is listed only then
 * (`eligibleCards`); the member count and the strip of members stay in-app.
 *
 * @module lib/rewind/cards/standing
 */

import type { ReactElement } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { LABEL } from "./parts"
import { CARD_MEASURE, fitNameplate, Line, Nameplate, Text } from "./type"

export function StandingCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const percentile = input.page.facts["standing.percentile"]?.display ?? ""

  return (
    <Frame input={input}>
      <Line text="Standing" face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} style={{ marginTop: 40 }} />
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", borderTop: `3px solid ${ink.on}`, paddingTop: 40 }}>
        <Nameplate fit={fitNameplate(percentile, CARD_MEASURE, 360, 2)} lineHeight={0.86} />
        <Text text="by hours watched on the server" family="display" size={72} width={CARD_MEASURE} style={{ marginTop: 28 }} />
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <Text text="Nobody else is named." family="text" size={36} />
    </Frame>
  )
}
