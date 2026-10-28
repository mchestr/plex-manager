/**
 * 02 The number card (design 6.4 "big number"): the card headline, the year's
 * total as a hero numeral, and the soundtrack the total is made of. The hero
 * is the hours from 10 hours up, else the duration ("7 h 20 m"), as on the page.
 *
 * @module lib/rewind/cards/number
 */

import type { ReactElement } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { CardHeadline, SoundtrackStrip } from "./parts"
import { CARD_MEASURE, fitNameplate, Nameplate, Text } from "./type"

const HERO_HOURS = 10

export function NumberCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const og = input.size === "og"
  const measure = og ? 1080 : CARD_MEASURE
  const { facts } = input.page
  const hours = facts["time.totalHours"]
  const hoursHero = hours && Number(hours.display.replace(/\D/g, "")) >= HERO_HOURS
  const hero = hoursHero ? hours.display : facts["time.totalMinutes"]?.display ?? hours?.display ?? ""
  const heroFit = fitNameplate(hero, measure, og ? 200 : 420, 1)

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : 60 }}>
        <CardHeadline input={input} measure={measure} sizeMax={og ? 60 : 96} maxLines={og ? 1 : 3} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 16 : 120 }}>
        <Nameplate fit={heroFit} lineHeight={0.86} />
        {hoursHero ? <Text text="hours of movies and shows" family="display" size={og ? 40 : 72} style={{ marginTop: og ? 4 : 20 }} /> : null}
      </div>
      {og ? null : <div style={{ display: "flex", flexGrow: 1 }} />}
      {og ? null : <SoundtrackStrip input={input} ink={ink} width={measure} height={200} />}
    </Frame>
  )
}
