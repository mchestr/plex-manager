/**
 * 09 The clock card (design 6.4): the card headline, the evidence clock with
 * the after-dark window (10 PM to 4 AM) bracketed in the spot colour and its
 * share in the centre, then the busiest and quietest hours and the zone.
 *
 * @module lib/rewind/cards/clock
 */

import type { ReactElement } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame, type CardInk } from "./frame"
import { CardHeadline, LABEL, ringSvg } from "./parts"
import { CARD_MEASURE, Graphic, Line, Text } from "./type"

const AFTER_DARK = { from: 22, to: 3 }

/** A clock's centre: the share its arc brackets and what it counts. */
function RingFace({ share, caption, size }: { share: string; caption: string; size: number }): ReactElement {
  return (
    <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: size, height: size, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Line text={share} face={{ wdth: 75, weight: 900, size: Math.round(size * 0.12), measure: size * 0.34 }} style={{ lineHeight: `${Math.round(size * 0.12)}px` }} />
      <Text text={caption} family="textItalic" size={Math.round(size * 0.036)} width={Math.round(size * 0.3)} style={{ marginTop: 4, textAlign: "center", justifyContent: "center" }} />
    </div>
  )
}

/** A clock with its centre; just the bars when there is nothing to put in it. */
export function Clock({ hours, arc, peak, share, caption, size, ink }: { hours: readonly number[]; arc: { from: number; to: number } | null; peak: number | null; share: string | null; caption: string; size: number; ink: CardInk }): ReactElement {
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <Graphic svg={ringSvg(hours, { size, arc, peak, ink })} width={size} height={size} />
      {share ? <RingFace share={share} caption={caption} size={size} /> : null}
    </div>
  )
}

function HourStat({ value, label, width }: { value: string; label: string; width: number }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <Line text={value} face={{ wdth: 87.5, weight: 900, size: 72, measure: width }} style={{ lineHeight: "76px" }} />
      <Text text={label} family="textItalic" size={34} />
    </div>
  )
}

export function ClockCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const og = input.size === "og"
  const measure = og ? 1080 : CARD_MEASURE
  const { facts, hours } = input.page
  const peak = facts["hours.peak"]?.display
  const quietest = facts["hours.quietest"]?.display
  const zone = facts["tz.label"]?.display
  const share = facts["hours.afterDarkShare"]?.display ?? null
  const size = og ? 300 : 640

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : 40 }}>
        <CardHeadline input={input} measure={og ? 700 : measure} sizeMax={og ? 60 : 96} maxLines={og ? 2 : 3} />
      </div>
      {hours ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: og ? 0 : 70, ...(og ? { position: "absolute", right: 0, top: 60 } : {}) }}>
          <Clock hours={hours} arc={AFTER_DARK} peak={null} share={share} caption="started 10 PM to 4 AM" size={size} ink={ink} />
        </div>
      ) : null}
      {og ? null : <div style={{ display: "flex", flexGrow: 1 }} />}
      <div style={{ display: "flex", justifyContent: "space-between", width: og ? 700 : measure, marginTop: og ? 30 : 0 }}>
        {peak ? <HourStat value={peak} label="busiest hour" width={og ? 340 : 440} /> : null}
        {quietest ? <HourStat value={quietest} label="quietest hour" width={og ? 340 : 440} /> : null}
      </div>
      {zone && !og ? <Line text={`Times in ${zone}`} face={{ ...LABEL, size: 27, measure }} style={{ marginTop: 40 }} /> : null}
    </Frame>
  )
}
