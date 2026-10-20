/**
 * The card frame (design 6.4): the field, and branding bands around the
 * safe zone. The story card is 1080 x 1920 with a 1080 x 1340 safe zone
 * between a 290 px masthead band and a 290 px foot band; the OG card is
 * 1200 x 630 with a single masthead line.
 *
 * The masthead names the server only when the projection's `brand` is set,
 * else it reads "Rewind 2026"; the foot carries the serial. Colours come from
 * `rewindInks` by the page's registry field, with the archetype's colourway
 * only when the projected page carries the archetype.
 *
 * @module lib/rewind/cards/frame
 */

import type { ReactElement, ReactNode } from "react"

import { rewindInks } from "@/lib/design/tokens"
import { registry } from "@/lib/rewind/registry"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import type { CardInput, CardSize } from "@/lib/wrapped/data/share-safe"

import { CARD_MEASURE, Line } from "./type"

export const CARD_SIZES: Record<CardSize, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
}

/** The story card's safe zone. */
const SAFE_ZONE = { top: 290, height: 1340 } as const

export interface CardInk {
  field: string
  on: string
}

/** The page's field and ink; the archetype colourway only where the projection published it. */
export function cardInk(input: CardInput): CardInk {
  const { ink } = pageInk(registry[input.page.type], input.page.archetype?.id ?? null)
  return { field: rewindInks[ink].field.hex, on: rewindInks[ink].on.hex }
}

const LABEL = { wdth: 100, weight: 600 } as const

function Masthead({ input, ink, width }: { input: CardInput; ink: CardInk; width: number }): ReactElement {
  const issue = `Rewind ${input.year}`
  return (
    <div style={{ display: "flex", flexDirection: "column", width, color: ink.on }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        {input.brand ? <Line text={input.brand} face={{ ...LABEL, size: 34, measure: width - 320 }} /> : null}
        <Line text={issue} face={{ wdth: 125, weight: 900, size: 34, measure: 300 }} />
      </div>
      <div style={{ display: "flex", height: 3, backgroundColor: ink.on, marginTop: 18 }} />
    </div>
  )
}

function Foot({ input, ink }: { input: CardInput; ink: CardInk }): ReactElement {
  const volume = input.page.facts["member.volume"]?.display
  return (
    <div style={{ display: "flex", flexDirection: "column", width: CARD_MEASURE, color: ink.on }}>
      <div style={{ display: "flex", height: 3, backgroundColor: ink.on, marginBottom: 18 }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Line text={volume ? `Vol. ${volume}` : `Rewind ${input.year}`} face={{ ...LABEL, size: 27, measure: 400 }} />
        {input.serial ? <Line text={`No. ${input.serial}`} face={{ ...LABEL, size: 27, measure: 300 }} /> : null}
      </div>
    </div>
  )
}

/** The frame around a card's content, which is laid out inside the safe zone (story) or below the masthead (OG). */
export function Frame({ input, children }: { input: CardInput; children: ReactNode }): ReactElement {
  const ink = cardInk(input)
  const { width, height } = CARD_SIZES[input.size]
  const base = { display: "flex", position: "relative", width, height, backgroundColor: ink.field, color: ink.on } as const
  if (input.size === "og") {
    return (
      <div style={base}>
        <div style={{ display: "flex", position: "absolute", left: 60, top: 48 }}>
          <Masthead input={input} ink={ink} width={1080} />
        </div>
        <div style={{ display: "flex", position: "absolute", left: 60, top: 150, width: 1080, height: 430, flexDirection: "column" }}>
          {children}
        </div>
      </div>
    )
  }
  return (
    <div style={base}>
      <div style={{ display: "flex", position: "absolute", left: 72, top: 150 }}>
        <Masthead input={input} ink={ink} width={CARD_MEASURE} />
      </div>
      <div style={{ display: "flex", position: "absolute", left: 72, top: SAFE_ZONE.top, width: CARD_MEASURE, height: SAFE_ZONE.height, flexDirection: "column" }}>
        {children}
      </div>
      <div style={{ display: "flex", position: "absolute", left: 72, top: SAFE_ZONE.top + SAFE_ZONE.height + 40 }}>
        <Foot input={input} ink={ink} />
      </div>
    </div>
  )
}
