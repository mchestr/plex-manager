/**
 * Discord response denylist — the FINAL backstop pass (design §4.4, FR-8).
 *
 * The primary PII defence is the per-tool output allowlist applied in the
 * executor dispatch (`scrubForDiscord`). This module is the last line of
 * defence: a regex denylist run over the assistant's fully-composed TEXT in
 * `handleDiscordChat` (lib/discord/services.ts), catching anything that slipped
 * through (e.g. a hallucinated address, or text the model paraphrased).
 *
 * Patterns are ordered from most specific to least so that, for example, an
 * email is redacted as a unit before its trailing digits could be mistaken for
 * an id. `sanitizeDiscordResponse` returns `{ content, redacted }`.
 */

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE_REGEX = /(?<!\d)(?:\+?\d{1,2}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g
const IPV4_REGEX = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g
// IPv6: full and compressed forms (including "::" prefixed like ::1). A leading
// "::" cannot sit on a \b (colon is a non-word char), so the compressed-prefix
// alternative is anchored with a lookbehind for a non-hex-word char / start.
const IPV6_REGEX = new RegExp(
  [
    // full / mid-compressed: at least two colon-separated hex groups
    "\\b(?:[0-9A-F]{1,4}:){2,7}[0-9A-F]{1,4}\\b",
    // mid/trailing "::" compression: groups then "::" then optional multi-group
    // tail. The tail must allow repeated ":hex" groups — JS alternation is
    // first-match-wins (not longest), so a single-group tail would leave the
    // remainder of e.g. 2001:db8::8a2e:370:7334 unredacted.
    "\\b(?:[0-9A-F]{1,4}:){1,7}:(?:[0-9A-F]{1,4}(?::[0-9A-F]{1,4})*)?",
    // leading "::" compression (e.g. ::1, ::ffff:1.2.3.4-style tails)
    "(?<![0-9A-F:])::(?:[0-9A-F]{1,4}(?::[0-9A-F]{1,4})*)?",
  ].join("|"),
  "gi"
)
// Labelled ids ("plex user id: 123", "account id - abc"). Kept for messages that
// name the field explicitly.
const LABELLED_ID_REGEX =
  /\b(?:plex\s*(?:user)?\s*id|user\s*id|account\s*id|machine\s*identifier|session\s*id|rating\s*key)\s*[:#-]?\s*[A-Za-z0-9_-]+\b/gi
// Structural ids: Discord snowflakes are 17-19 digit integers; also redact long
// bare numeric (17+) and long hex (24+, e.g. Plex machine identifiers / object
// ids) tokens on word boundaries. IPv4/IPv6 run first so dotted/colon addresses
// are already consumed and won't reach here.
const SNOWFLAKE_REGEX = /\b\d{17,20}\b/g
const LONG_HEX_REGEX = /\b[0-9a-f]{24,}\b/gi

const REDACT_PLACEHOLDER = "[redacted]"

function stripExcessWhitespace(value: string) {
  return value.replace(/\s{2,}/g, " ").replace(/\s+\n/g, "\n").trim()
}

export function sanitizeDiscordResponse(content: string) {
  if (!content) {
    return { content: "", redacted: false }
  }

  let sanitized = content
  let redacted = false

  // Order matters: emails/phones first, then IP addresses (IPv4 then IPv6),
  // then labelled ids, then structural (snowflake / long-hex) ids last.
  const patterns = [
    EMAIL_REGEX,
    PHONE_REGEX,
    IPV4_REGEX,
    IPV6_REGEX,
    LABELLED_ID_REGEX,
    SNOWFLAKE_REGEX,
    LONG_HEX_REGEX,
  ]
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    if (pattern.test(sanitized)) {
      redacted = true
      pattern.lastIndex = 0
      sanitized = sanitized.replace(pattern, REDACT_PLACEHOLDER)
    }
    pattern.lastIndex = 0
  }

  sanitized = stripExcessWhitespace(sanitized)

  return { content: sanitized, redacted }
}

/** Discord rejects a message longer than this many characters. */
export const DISCORD_MESSAGE_LIMIT = 2000

const CUT_SHORT_NOTE = "\n\n(Reply cut short.)"
const FENCE = "```"
const FENCE_CLOSE = `\n${FENCE}`

/** The opening line of the code fence still open at the end of `text`, or null. */
function openFence(text: string): string | null {
  let open: string | null = null
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.startsWith(FENCE)) open = open === null ? trimmed : null
  }
  return open
}

/** Where to cut `text` so the piece fits in `budget`: paragraph, then line, sentence, word. */
function findCut(text: string, budget: number): number {
  const window = text.slice(0, budget + 1)
  const floor = Math.floor(budget / 2)
  for (const separator of ["\n\n", "\n"]) {
    const at = window.lastIndexOf(separator, budget)
    if (at > floor) return at
  }
  for (let at = budget; at > floor; at--) {
    if (/\s/.test(window[at] ?? "") && /[.!?]/.test(window[at - 1] ?? "")) return at
  }
  for (let at = budget; at > 0; at--) {
    if (/\s/.test(window[at] ?? "")) return at
  }
  // No boundary at all: hard cut, but never between the halves of a surrogate pair
  const code = text.charCodeAt(budget - 1)
  return code >= 0xd800 && code <= 0xdbff ? budget - 1 : budget
}

/**
 * Fit an assistant reply into Discord messages of at most `limit` characters.
 *
 * Splits on paragraph, then line, sentence and word boundaries. A code fence
 * open at a cut is closed at the end of that chunk and reopened (with its
 * language) at the start of the next. When the text needs more than
 * `maxChunks` messages, the last chunk ends with "(Reply cut short.)".
 *
 * @example
 * ```ts
 * fitDiscordContent("short answer") // => ["short answer"]
 * fitDiscordContent("word ".repeat(600)).length // => 2
 * ```
 */
export function fitDiscordContent(
  text: string,
  { limit = DISCORD_MESSAGE_LIMIT, maxChunks = 3 }: { limit?: number; maxChunks?: number } = {}
): string[] {
  const chunks: string[] = []
  let rest = text
  let reopen = ""
  while (rest.length > 0) {
    const prefix = reopen ? `${reopen}\n` : ""
    if (prefix.length + rest.length <= limit) {
      chunks.push(prefix + rest)
      break
    }
    const last = chunks.length === maxChunks - 1
    const budget = limit - prefix.length - FENCE_CLOSE.length - (last ? CUT_SHORT_NOTE.length : 0)
    const cut = findCut(rest, Math.max(budget, 1))
    const piece = prefix + rest.slice(0, cut).trimEnd()
    const fence = openFence(piece)
    const chunk = fence === null ? piece : piece + FENCE_CLOSE
    if (last) {
      chunks.push(chunk + CUT_SHORT_NOTE)
      break
    }
    chunks.push(chunk)
    reopen = fence ?? ""
    rest = rest.slice(cut).replace(/^(\n+| )/, "")
  }
  return chunks
}
