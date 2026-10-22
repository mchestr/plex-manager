/**
 * 04 "Guess my No. 1" teaser card (design 6.4): the quiz question and three
 * tiles, posters when the member includes art, else typographic title cards
 * in the page's spot. The guess page publishes only the runners-up
 * (`series[2]` to `series[4]`), so the card can never print the answer.
 *
 * @module lib/rewind/cards/guess-teaser
 */

import type { ReactElement } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame, type CardInk } from "./frame"
import { CardHeadline, CardTitle, NO_ASSETS, PosterSlot, type CardAssets } from "./parts"
import { CARD_MEASURE, fitNameplate, Nameplate, Text } from "./type"

const TILE = { width: 288, height: 432, gap: 36 } as const

/** A title card the size of a poster: the title set inside a bordered tile in the spot colour, in the field's colour where the spot is the ink. */
function TitleTile({ title, ink }: { title: string; ink: CardInk }): ReactElement {
  const color = ink.spot === ink.on ? ink.field : ink.on
  return (
    <div style={{ display: "flex", width: TILE.width, height: TILE.height, border: `5px solid ${ink.on}`, borderRadius: 6, backgroundColor: ink.spot, color, padding: 24, alignItems: "flex-end" }}>
      <CardTitle text={title} measure={TILE.width - 58} sizeMin={34} sizeMax={52} maxLines={4} />
    </div>
  )
}

export function GuessTeaserCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement {
  const ink = cardInk(input)
  const { page } = input
  const tiles = page.titles.slice(0, 3)

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <Nameplate fit={fitNameplate("Guess my No. 1", CARD_MEASURE, 150, 2)} />
      </div>
      <div style={{ display: "flex", marginTop: 32 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={64} maxLines={2} />
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", width: CARD_MEASURE, justifyContent: "center" }}>
        {tiles.map((title, i) => (
          <div key={`${i}:${title}`} style={{ display: "flex", marginLeft: i === 0 ? 0 : TILE.gap }}>
            {page.art?.[i] && assets.art[i] ? <PosterSlot src={assets.art[i]} width={TILE.width} height={TILE.height} ink={ink} /> : <TitleTile title={title} ink={ink} />}
          </div>
        ))}
      </div>
      <Text text="None of these is my No. 1." family="display" size={56} style={{ marginTop: 48 }} />
    </Frame>
  )
}
