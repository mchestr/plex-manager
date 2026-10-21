/**
 * The share cards by page type (design 6.4). Each renderer draws one card
 * from a `CardInput`, the projected page and nothing else, plus the poster
 * art already fetched for it. P5.10 shipped the cover, P5.11 the other core
 * cards and P7.6 the rest, the short editions' Short list and postcard
 * included (`CARD_PAGE_TYPES`); Setup and Next year have none. A page with no
 * renderer has no card, and the card routes answer 404 for it.
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
import { BookendsCard } from "./bookends"
import { CalendarCard } from "./calendar"
import { CentrefoldCard } from "./centrefold"
import { ClockCard } from "./clock"
import { CoverCard } from "./cover"
import { GuessTeaserCard } from "./guess-teaser"
import { NumberCard } from "./number"
import { NO_ASSETS, type CardAssets } from "./parts"
import { PeopleCard } from "./people"
import { PostcardCard } from "./postcard"
import { RaceCard } from "./race"
import { RecordsCard } from "./records"
import { RequestsCard } from "./requests"
import { ShortListCard } from "./short-list"
import { StandingCard } from "./standing"
import { TasteCard } from "./taste"
import { TopFilmsCard } from "./top-films"
import { TopShowsCard } from "./top-shows"

type CardRenderer = (input: CardInput, assets: CardAssets) => ReactElement

const RENDERERS: Partial<Record<SharePageType, CardRenderer>> = {
  cover: CoverCard,
  number: NumberCard,
  bookends: BookendsCard,
  guess: GuessTeaserCard,
  "top-shows": TopShowsCard,
  "top-films": TopFilmsCard,
  taste: TasteCard,
  people: PeopleCard,
  clock: ClockCard,
  calendar: CalendarCard,
  race: RaceCard,
  records: RecordsCard,
  requests: RequestsCard,
  standing: StandingCard,
  centrefold: CentrefoldCard,
  "back-cover": BackCoverCard,
  "short-list": ShortListCard,
  postcard: PostcardCard,
}

/** The pages that have a card. @internal */
export const CARD_PAGES = Object.keys(RENDERERS) as SharePageType[]

/** Whether `page` has a card yet. */
export const hasCard = (page: SharePageType): boolean => RENDERERS[page] !== undefined

/** The card's element tree, or null when the page has no card yet. */
export function renderCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement | null {
  return RENDERERS[input.page.type]?.(input, assets) ?? null
}
