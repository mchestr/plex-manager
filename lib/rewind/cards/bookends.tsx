/**
 * 03 Bookends card (design 6.4): the card headline, then the year's first
 * play and its latest (its last after the final cut), each a title with its
 * date, and "Member since". A hidden title is not in the projection, so its
 * block is left out.
 *
 * @module lib/rewind/cards/bookends
 */

import type { ReactElement } from "react"

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { CardHeadline, CardTitle, LABEL } from "./parts"
import { CARD_MEASURE, Line, Text } from "./type"

function End({ lead, title, date, rule }: { lead: string; title: string; date: string; rule: string }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderTop: `3px solid ${rule}`, paddingTop: 28, marginTop: 56 }}>
      <Line text={lead} face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} />
      <div style={{ display: "flex", marginTop: 18 }}>
        <CardTitle text={title} measure={CARD_MEASURE} sizeMin={56} sizeMax={96} maxLines={3} />
      </div>
      {date ? <Text text={date} family="display" size={52} style={{ marginTop: 10 }} /> : null}
    </div>
  )
}

export function BookendsCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const og = input.size === "og"
  const { page } = input
  const title = (id: FactId) => page.titles[page.titleIds.indexOf(id)]
  const ends = [
    { side: "first", lead: "The first play" },
    { side: "last", lead: input.window.finalCut ? "And you closed it with" : "And most recently" },
  ].flatMap(({ side, lead }) => {
    const name = title(`bookends.${side}.title` as FactId)
    return name ? [{ side, lead, title: name, date: page.facts[`bookends.${side}.date` as FactId]?.display ?? "" }] : []
  })
  const since = page.facts["member.since"]?.display

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : 40 }}>
        <CardHeadline input={input} measure={og ? 1080 : CARD_MEASURE} sizeMax={og ? 60 : 96} maxLines={og ? 2 : 3} />
      </div>
      {ends.map((end) => (
        <End key={end.side} lead={end.lead} title={end.title} date={end.date} rule={ink.on} />
      ))}
      <div style={{ display: "flex", flexGrow: 1 }} />
      {since ? <Line text={`Member since ${since}`} face={{ ...LABEL, size: 32, measure: CARD_MEASURE }} /> : null}
    </Frame>
  )
}
