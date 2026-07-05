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
