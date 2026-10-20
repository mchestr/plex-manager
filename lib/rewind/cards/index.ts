/**
 * The share cards by page type (design 6.4). Each renderer draws one card
 * from a `CardInput`, the projected page and nothing else. P5.10 ships the
 * cover; P5.11 adds the other core cards and P7.6 the rest. A page with no
 * renderer yet has no card, and the card routes answer 404 for it.
 *
 * Satori rules hold for every file here: the `rewindCards` lint selectors
 * and the tree test in `__tests__/cards-tree.test.tsx`.
 *
 * @module lib/rewind/cards
 */

import type { ReactElement } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"
import type { SharePageType } from "@/lib/wrapped/data/share-safe-schema"

import { CoverCard } from "./cover"

type CardRenderer = (input: CardInput) => ReactElement

const RENDERERS: Partial<Record<SharePageType, CardRenderer>> = {
  cover: CoverCard,
}

/** The pages that have a card. @internal */
export const CARD_PAGES = Object.keys(RENDERERS) as SharePageType[]

/** Whether `page` has a card yet. */
export const hasCard = (page: SharePageType): boolean => RENDERERS[page] !== undefined

/** The card's element tree, or null when the page has no card yet. */
export function renderCard(input: CardInput): ReactElement | null {
  return RENDERERS[input.page.type]?.(input) ?? null
}
