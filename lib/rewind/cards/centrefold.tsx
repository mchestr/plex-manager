/**
 * 16 Centrefold card, the primary share poster (`card-centrefold.png`): "I’m
 * the" and the archetype's name as a nameplate, its poster line (the enum
 * line from `posterLineId`, never model text), the evidence clock, and the
 * three stats the member chose or the defaults. Printed in the archetype's
 * colourway. Without an archetype it prints the page's title-free headline.
 *
 * @module lib/rewind/cards/centrefold
 */

import type { ReactElement } from "react"

import { nameAfterLead, RINGS } from "@/lib/rewind/pages/centrefold"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { Clock } from "./clock"
import { cardInk, Frame } from "./frame"
import { CardHeadline, StatsRow } from "./parts"
import { CARD_MEASURE, fitNameplate, Line, Nameplate, Text } from "./type"

const WINDOW_CAPTION: Partial<Record<FactId, string>> = {
  "hours.afterDarkShare": "started 10 PM to 4 AM",
  "hours.goldenShare": "started 6 PM to 10 PM",
}

export function CentrefoldCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const og = input.size === "og"
  const measure = og ? 640 : CARD_MEASURE
  const { page } = input
  const archetype = page.archetype
  const ring = archetype ? RINGS[archetype.id] : undefined
  const ringShare = ring ? page.facts[ring.share]?.display ?? null : null
  const peak = page.facts["hours.peak"]?.display ?? null
  const clockSize = og ? 300 : 480

  const clock = page.hours ? (
    <Clock
      hours={page.hours}
      arc={ringShare && ring ? ring.arc : null}
      peak={null}
      share={ringShare ?? peak}
      caption={ringShare && ring ? (WINDOW_CAPTION[ring.share] ?? "") : "busiest hour"}
      size={clockSize}
      ink={ink}
    />
  ) : null

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", width: measure, marginTop: og ? 0 : 6 }}>
        {archetype ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Text text={"I’m the"} family="display" size={og ? 54 : 108} lineHeight={1} />
            <div style={{ display: "flex", marginTop: 10 }}>
              <Nameplate fit={fitNameplate(nameAfterLead(archetype.name), measure, og ? 130 : 240, 2)} lineHeight={0.84} />
            </div>
            {archetype.posterLine && !og ? <Text text={archetype.posterLine} family="text" size={50} width={measure} style={{ marginTop: 26 }} /> : null}
          </div>
        ) : (
          <CardHeadline input={input} measure={measure} sizeMax={og ? 80 : 150} maxLines={3} />
        )}
      </div>
      {og ? (
        <div style={{ display: "flex", position: "absolute", right: 0, top: 40 }}>{clock}</div>
      ) : (
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "space-between" }}>
          {ringShare && peak ? (
            <div style={{ display: "flex", flexDirection: "column", width: 220, borderTop: `3.5px solid ${ink.on}`, paddingTop: 12 }}>
              <Line text={peak} face={{ wdth: 87.5, weight: 900, size: 46, measure: 208 }} style={{ lineHeight: "50px" }} />
              <Text text="busiest hour" family="textItalic" size={32} />
            </div>
          ) : (
            <div style={{ display: "flex", width: 220 }} />
          )}
          {clock}
          <div style={{ display: "flex", width: 220 }} />
        </div>
      )}
      <div style={{ display: "flex", marginTop: og ? 24 : 0 }}>
        <StatsRow input={input} ink={ink} width={measure} />
      </div>
    </Frame>
  )
}
