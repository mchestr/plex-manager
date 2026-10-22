/**
 * 06 Top films card (design 6.4 "top five films"): the Top shows layout for
 * the member's films, each with its minutes and, for a rewatch, how many
 * times it was played.
 *
 * @module lib/rewind/cards/top-films
 */

import type { ReactElement } from "react"

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { countOf, NO_ASSETS, type CardAssets } from "./parts"
import { TopListCard } from "./top-shows"

export function TopFilmsCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement {
  const { facts } = input.page
  return TopListCard(input, assets, (id) => {
    const fact = (field: string) => facts[id.replace(/\.title$/, `.${field}`) as FactId]?.display
    const plays = fact("plays")
    return [fact("minutes"), countOf(plays) >= 2 ? `watched ${plays} times` : null].filter(Boolean).join(", ")
  })
}
