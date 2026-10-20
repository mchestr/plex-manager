/**
 * Every product string in one place (ui-design-system 7.1, UI-39), so a
 * rename is a one-line change.
 *
 * - Members see the owner's server name (`serverName()`), never "Plex Manager".
 * - "Plex Manager" (`productName`) appears only in setup, the admin footer,
 *   `<title>` fallbacks and docs, and names this app to plex.tv and Jellyfin.
 * - The annual recap is "{server name} Rewind {year}" (`rewindName()`).
 *
 * @example
 * ```ts
 * await serverName()        // "Northfield Plex"
 * await rewindName(2026)    // "Northfield Plex Rewind 2026"
 * monogramFor("émile")      // "É"
 * monogramFor("東京サーバー") // null: the icon draws the pip-only tile
 * ```
 *
 * @module lib/brand
 */

import { covers } from "@/lib/og/coverage"
import { getAppSettings } from "@/lib/settings/app-settings"

export const productName = "Plex Manager"

/**
 * The `X-Plex-Product` header. plex.tv lists the device under it; changing it
 * relabels the device, but tokens keep working because the client identifier
 * stays the same. Its own string, so it can change apart from `productName`.
 */
export const plexProduct = "Plex Manager"

/** The `Client` that Jellyfin records for this app's sign-ins. */
export const jellyfinClientName = "Plex Manager"

/**
 * The brand members see: `Config.serverName`, else the active Plex server's
 * name, else the active Jellyfin server's, else `productName`. The only
 * reader of `Config.serverName`.
 */
export async function serverName(): Promise<string> {
  return (await getAppSettings()).serverName ?? productName
}

/** "{server name} Rewind {year}", for titles, share cards and OG. @public P5.1's titles are its first caller. */
export async function rewindName(year: number): Promise<string> {
  return `${await serverName()} Rewind ${year}`
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** The name as ASCII: accents stripped, everything else dropped. */
function slugLetters(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "")
}

/**
 * The letter on the app icon: the name's first grapheme, uppercased for
 * `locale`. When the OG fonts cannot draw it (CJK, Arabic, Hebrew, emoji), the
 * first Latin letter of the name's slug; `null` when there is none, and the
 * icon is the pip-only tile (ui-design-system 7.5).
 */
export function monogramFor(name: string, locale = "en-US"): string | null {
  const first = graphemes.segment(name.normalize("NFC").trim())[Symbol.iterator]().next().value?.segment
  const letter = first?.toLocaleUpperCase(locale)
  if (letter && covers(letter, "OgSans-600")) return letter
  const latin = slugLetters(name)[0]
  return latin ? latin.toLocaleUpperCase(locale) : null
}
