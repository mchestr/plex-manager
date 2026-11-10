/**
 * The words of the Leaving soon collections in Plex (TS 8.10, 12.7 item 4,
 * 13.6, UX 3.4 and 9.5). Pure and client-safe.
 *
 * 1. Titles come from `COLLECTION_TITLES`: "Movies leaving soon", "Shows
 *    leaving soon", "Seasons leaving soon".
 * 2. The summary names the server and the member page only. It holds no
 *    member name, rule name, size or date.
 * 3. {@link isSeasonalCollectionTitle} finds Kometa's seasonal collections
 *    ("Christmas Movies", with or without a leading emoji), whose members the
 *    library read lists for the G13 suggestion.
 *
 * @module lib/cleanup/collections/text
 */

/** Kometa's seasonal defaults (`defaults/movie/seasonal.yml`, `<<key_name>> <<library_typeU>>s`), TS 12.7 item 4. */
const SEASONAL_DAYS = [
  "New Year's Day", "Valentine's Day", "St. Patrick's Day", "Easter", "Mother's Day", "Memorial Day", "Father's Day", "Independence Day",
  "Labor Day", "Halloween", "Veteran's Day", "Thanksgiving", "Christmas",
]
const SEASONAL_TITLES = new Set(SEASONAL_DAYS.map((day) => `${day} Movies`))

/** A leading emoji (with its joiners, variation selectors, skin tones and flag letters) and the space after it. */
const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{FE0F}|\u{200D})+\s+/u

/** A collection title as G13 compares it: trimmed, in lower case (`globals-show.ts`). */
export function normTitle(title: string): string {
  return title.trim().toLowerCase()
}

/** Whether `title` is one of Kometa's seasonal collections, after a leading emoji and space are dropped. */
export function isSeasonalCollectionTitle(title: string): boolean {
  return SEASONAL_TITLES.has(title.trim().replace(LEADING_EMOJI, ""))
}

/**
 * The summary of every Leaving soon collection (UX 3.4).
 *
 * @example
 * ```ts
 * collectionSummary("Example Plex", "https://plex.example.com/")
 * // "These titles leave Example Plex soon, the soonest first. To keep one, open https://plex.example.com/leaving-soon"
 * ```
 */
export function collectionSummary(serverName: string, appUrl: string): string {
  return `These titles leave ${serverName} soon, the soonest first. To keep one, open ${appUrl.replace(/\/+$/, "")}/leaving-soon`
}
