/**
 * Someone else's words in a Discord message, as plain text: a member's name,
 * a title from Plex, a note. Messages are sent with `allowed_mentions:
 * { parse: [] }` (`sendDiscordDirectMessage`), so nothing pings; this makes
 * the words read as typed too.
 *
 * 1. Format characters (bidi controls, zero-width spaces) are dropped, so the
 *    text can't reorder or hide what comes after it.
 * 2. Line breaks, tabs and runs of spaces become one space: one line.
 * 3. It is cut to `max` characters, with an ellipsis.
 * 4. Every character Discord reads as markup is escaped with a backslash:
 *    formatting, quotes and headings, masked links (`[...](...)`), the colon
 *    of a bare link, mentions, channels and timestamps (`<@...>`, `<t:...>`).
 *    Discord hides the backslashes.
 *
 * @example
 * ```ts
 * plainDiscordText("[Heat](https://evil.example)", 100) // "\\[Heat\\]\\(https\\://evil.example\\)"
 * ```
 *
 * @module lib/discord/plain-text
 */

const FORMAT = /\p{Cf}/gu
const SPACES = /[\p{Cc}\p{Zl}\p{Zp}\s]+/gu
const MARKUP = /[\\*_~`|<>#\-[\]()@:]/g

/** The text as one escaped line of at most `max` characters, before escaping. */
export function plainDiscordText(text: string, max: number): string {
  const flat = Array.from(text.replace(FORMAT, "").replace(SPACES, " ").trim())
  const cut = flat.length > max ? `${flat.slice(0, max - 1).join("").trimEnd()}…` : flat.join("")
  return cut.replace(MARKUP, "\\$&")
}
