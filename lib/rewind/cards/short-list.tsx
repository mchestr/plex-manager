/**
 * Short list card (the pocket edition's page in place of Top shows and Top
 * films, design 4.5): the Top shows layout for the member's top three titles
 * of any type, numbered in order, each with its minutes. Like the page, it
 * prints no other numbers.
 *
 * @module lib/rewind/cards/short-list
 */

import type { ReactElement } from "react"

import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { NO_ASSETS, type CardAssets } from "./parts"
import { TopListCard } from "./top-shows"

export function ShortListCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement {
  const { facts } = input.page
  return TopListCard(
    input,
    assets,
    (id) => facts[id.replace(/\.title$/, ".minutes") as FactId]?.display ?? "",
    (_id, i) => i + 1
  )
}
