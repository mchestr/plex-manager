/**
 * The share cards by page type (design 6.4). Each renderer draws one card
 * from a `CardInput`, the projected page and nothing else, plus the poster
 * art already fetched for it. P5.10 shipped the cover; P5.11 the other core
 * cards (`CARD_PAGE_TYPES`), and P7.6 adds the rest. A page with no renderer
 * yet has no card, and the card routes answer 404 for it.
 *
 * Satori rules hold for every file here: the `rewindCards` lint selectors
 * and the tree test in `__tests__/cards-tree.test.tsx`.
 *
 * @module lib/rewind/cards
 */

import type { ReactElement } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"
import type { SharePageType } from "@/lib/wrapped/data/share-safe-schema"

import { BackCoverCard } from "./back-cover"
import { CentrefoldCard } from "./centrefold"
import { ClockCard } from "./clock"
import { CoverCard } from "./cover"
import { NumberCard } from "./number"
import { NO_ASSETS, type CardAssets } from "./parts"
import { TopShowsCard } from "./top-shows"

type CardRenderer = (input: CardInput, assets: CardAssets) => ReactElement

const RENDERERS: Partial<Record<SharePageType, CardRenderer>> = {
  cover: CoverCard,
  number: NumberCard,
  "top-shows": TopShowsCard,
  clock: ClockCard,
  centrefold: CentrefoldCard,
  "back-cover": BackCoverCard,
}

/** The pages that have a card. @internal */
export const CARD_PAGES = Object.keys(RENDERERS) as SharePageType[]

/** Whether `page` has a card yet. */
export const hasCard = (page: SharePageType): boolean => RENDERERS[page] !== undefined

/** The card's element tree, or null when the page has no card yet. */
export function renderCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement | null {
  return RENDERERS[input.page.type]?.(input, assets) ?? null
}
