/**
 * Postcard card (design 4.5): the whole issue of a quiet year, with no
 * numbers. "A quiet year on {server}" (the server only when the projection's
 * `brand` is set), the titles 3 or more members watched (the projection's
 * `graphic`, no counts, none the member hid) and "Browse the library".
 *
 * @module lib/rewind/cards/postcard
 */

import type { ReactElement } from "react"

import { POSTCARD_TITLES_LABEL } from "@/lib/rewind/pages/postcard"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { CardHeadline, CardTitle, LABEL } from "./parts"
import { CARD_MEASURE, Line, Text } from "./type"

export function PostcardCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const titles = input.page.graphic?.kind === "titles" ? input.page.graphic.titles : []

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 80 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={150} maxLines={4} />
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      {titles.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", width: CARD_MEASURE, borderTop: `3px solid ${ink.on}`, paddingTop: 28 }}>
          <Line text={POSTCARD_TITLES_LABEL} face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} />
          {titles.map((title, i) => (
            <div key={`${i}:${title}`} style={{ display: "flex", marginTop: 24 }}>
              <CardTitle text={title} measure={CARD_MEASURE} sizeMin={44} sizeMax={64} />
            </div>
          ))}
        </div>
      ) : null}
      <Text text="Browse the library" family="display" size={56} style={{ marginTop: 56 }} />
    </Frame>
  )
}
