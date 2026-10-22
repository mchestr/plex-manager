/**
 * 08 People card (design 6.4 "billing block"): names only, set like a
 * poster's credits. The No. 1 actor is a nameplate; the rest of the cast
 * follows "with" in Archivo 700 caps at W62, and the directors follow
 * "directed by", the connectors in Newsreader italic. No headshots.
 *
 * @module lib/rewind/cards/people
 */

import type { ReactElement } from "react"

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { CardHeadline } from "./parts"
import { CARD_MEASURE, fitNameplate, Line, Nameplate, Text } from "./type"

const names = (input: CardInput, role: "actor" | "director", count: number) =>
  Array.from({ length: count }, (_, i) => input.page.facts[`people.${role}[${i + 1}].name` as FactId]?.display).filter((n): n is string => Boolean(n))

const caps = (name: string) => name.toLocaleUpperCase("en-US")

function Credits({ lead, people }: { lead: string; people: string[] }): ReactElement | null {
  if (people.length === 0) return null
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: CARD_MEASURE, marginTop: 40 }}>
      <Text text={lead} family="display" size={48} />
      {people.map((name) => (
        <Line key={name} text={caps(name)} face={{ wdth: 62, weight: 700, size: 84, measure: CARD_MEASURE }} style={{ marginTop: 6 }} />
      ))}
    </div>
  )
}

export function PeopleCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const [star, ...cast] = names(input, "actor", 5)
  const directors = names(input, "director", 3)

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={96} maxLines={2} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 48, paddingTop: 36, paddingBottom: 36, borderTop: `3px solid ${ink.on}`, borderBottom: `3px solid ${ink.on}` }}>
        {star ? <Nameplate fit={fitNameplate(caps(star), CARD_MEASURE, 160, 2)} /> : null}
        <Credits lead="with" people={cast} />
        <Credits lead="directed by" people={directors} />
      </div>
    </Frame>
  )
}
