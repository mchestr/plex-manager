/**
 * Someone else's words in a Discord message, as plain text: a member's name,
 * a title from Plex, a note. Messages are sent with `allowed_mentions:
 * { parse: [] }` (`sendDiscordDirectMessage`), so nothing pings; this makes
 * the words read as typed too.
 *
 * 1. Format characters (bidi controls, zero-width spaces) are dropped, so the
 *    text can't reorder or hide what comes after it.
 * 2. Line breaks, tabs and runs of spaces become one space: one line.
 * 3. Every character Discord reads as markup is escaped with a backslash:
 *    formatting, quotes and headings, masked links (`[...](...)`), the colon
 *    of a bare link, mentions, channels and timestamps (`<@...>`, `<t:...>`).
 *    Discord's markdown hides a backslash before any character that isn't a
 *    letter, a digit or a space.
 * 4. It is cut to at most `max` characters, backslashes included, with an
 *    ellipsis, and never between a backslash and its character.
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
const MARKUP = /[\\*_~`|<>#\-[\]()@:]/

/** The text as one escaped line of at most `max` characters. */
export function plainDiscordText(text: string, max: number): string {
  const pieces = Array.from(text.replace(FORMAT, "").replace(SPACES, " ").trim(), (char) => (MARKUP.test(char) ? `\\${char}` : char))
  const whole = pieces.join("")
  if (whole.length <= max) return whole
  let kept = ""
  for (const piece of pieces) {
    if (kept.length + piece.length > max - 1) break
    kept += piece
  }
  return `${kept.trimEnd()}…`
}
