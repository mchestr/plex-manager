/**
 * The share sheet's wording and addresses (design 6.3, 6.5), as pure
 * functions: the owner card URL a preview and a shared file come from, the
 * file's name, the confirm step's sentence and the back cover's privacy line.
 * Client-safe.
 *
 * @module lib/rewind/share-sheet
 */

import type { CardFactId, ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

/** The sheet name the back cover's "Change" opens: the share sheet, focused on its switches. */
export const SHARE_SETTINGS_SHEET = "share-settings"

/** The choices a card is drawn with; the pages come from the picker or the link. */
export type CardChoices = Omit<ShareOptions, "pages">

/** What the server tells the sheet about a member's Rewind and its link. */
export interface ShareSetup {
  rewindId: string
  year: number
  /** `eligibleCards` of the issue, in issue order. */
  cards: SharePageType[]
  /** The cards whose page may print poster art (`share.art`). */
  artCards: SharePageType[]
  /** `Config.rewindAllowArtOnCards`. */
  allowArt: boolean
  /** `Config.rewindPublicLinks`. */
  publicLinks: boolean
  /** An active membership, with Stripe on; always true with it off. */
  canShare: boolean
  /** The member's saved choices for the year (`RewindPrefs`). */
  choices: CardChoices
  /** The live link, whose URL is never known again after it was shown. */
  link: { shareId: string; pages: SharePageType[]; expiresAt: string | null } | null
  /** "31 January 2027": when a link created now with the default expiry stops. */
  seasonCloses: string
  /** `eligibleCards` with Daily detail on, for "Save all" under either setting (P8.4). */
  dailyCards: SharePageType[]
  /** Each printed page's folio, for the ZIP's entry names. */
  folios: Partial<Record<SharePageType, number>>
  /** The poster stats the member may choose (`cardFactOptions`), in allow-list order. */
  cardFactOptions: CardFactId[]
  /** The stats each poster prints when the member has not chosen (P5.11's rule). */
  cardFactDefaults: Partial<Record<SharePageType, CardFactId[]>>
  /** The P1 share flags (P8.4): Edit card and Save all. */
  features: { editCard: boolean; saveAll: boolean }
}

/** Edit card's name for each poster stat. */
export const CARD_FACT_LABELS: Record<CardFactId, string> = {
  "time.totalHours": "Hours watched",
  "time.seriesHours": "Hours of shows",
  "counts.films": "Movies",
  "counts.episodes": "Episodes",
  "standing.percentile": "Standing on the server",
  "hours.peak": "Busiest hour",
  "streak.longest.days": "Longest streak",
  "archetype.rarityShare": "How rare your type is",
  "taste.genre[1].name": "Top genre",
  "records.completionShare": "How much you finished",
}

/** The pages whose poster prints three stats the member can choose (Edit card). */
export const EDIT_CARD_PAGES: readonly SharePageType[] = ["centrefold", "back-cover"]

/**
 * The cards "Save all" saves under the current Daily detail choice: the
 * calendar card is the only one that needs Daily detail (`eligibleCards`).
 *
 * @example
 * ```ts
 * saveAllCards(["cover", "calendar", "clock"], false) // ["cover", "clock"]
 * ```
 */
export function saveAllCards(dailyCards: readonly SharePageType[], dailyDetail: boolean): SharePageType[] {
  return dailyDetail ? [...dailyCards] : dailyCards.filter((card) => card !== "calendar")
}

/**
 * The owner card route for `page` with `choices`.
 *
 * @example
 * ```ts
 * cardUrl("wr1", "clock", { signed: true, includeArt: false, dailyDetail: false, cardFacts: [] })
 * // "/api/rewind/card/wr1/clock?signed=1&art=0&daily=0"
 * ```
 */
export function cardUrl(rewindId: string, page: SharePageType, choices: CardChoices): string {
  const query = new URLSearchParams({ signed: choices.signed ? "1" : "0", art: choices.includeArt ? "1" : "0", daily: choices.dailyDetail ? "1" : "0" })
  if (choices.cardFacts.length > 0) query.set("facts", choices.cardFacts.join(","))
  return `/api/rewind/card/${encodeURIComponent(rewindId)}/${page}?${query.toString()}`
}

/** `rewind-2026-centrefold.png`. */
export const cardFileName = (year: number, page: SharePageType) => `rewind-${year}-${page}.png`

/**
 * What the confirm step says will be public.
 *
 * @example
 * ```ts
 * confirmLine({ cards: 5, signed: false, expires: "31 January 2027" })
 * // "Anyone with the link will see these 5 cards, without your name, until 31 January 2027."
 * ```
 */
export function confirmLine({ cards, signed, expires }: { cards: number; signed: boolean; expires: string | null }): string {
  const what = cards === 1 ? "this card" : `these ${cards} cards`
  return `Anyone with the link will see ${what}, ${signed ? "with" : "without"} your name, until ${expires ?? "you stop sharing"}.`
}

/** The back cover's status line: "Public link off. Cards unsigned, no artwork." */
export function privacyStatus({ link, signed, includeArt }: { link: boolean; signed: boolean; includeArt: boolean }): string {
  return `Public link ${link ? "on" : "off"}. Cards ${signed ? "signed" : "unsigned"}, ${includeArt ? "with artwork" : "no artwork"}.`
}
