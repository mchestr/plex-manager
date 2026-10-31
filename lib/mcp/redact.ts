/**
 * The last guard on what an MCP tool returns: credentials are replaced before
 * a result leaves the server, by key name and inside strings.
 *
 * The loaders behind the read tools show a saved secret only as its last four
 * (`describeSecret`, `{ last4 }`), but a token's owner is an admin, and for an
 * admin the assistant's tools pass on what Sonarr, Radarr, Tautulli or Plex
 * returned: a grabbed release's download URL carries an indexer's `apikey=` or
 * a tracker passkey. A result reaches a model, and through a prompt injection
 * anyone who can steer it, so this module removes, at any depth:
 *
 * - the string value of a key that names a credential, compared with case and
 *   punctuation ignored: a key ending in `token` (`token`, `X-Plex-Token`,
 *   `shareToken`, `plexAuthToken`), one containing `apikey`, `secret`,
 *   `password`, `passkey`, `authorization`, `cookie`, `credential`,
 *   `sharekey`, `assetkey`, `privatekey`, `accesskey` or `sessionkey`, and
 *   every encrypted credential column
 *   (`ENCRYPTED_FIELDS` less `FREE_TEXT_FIELDS`, such as `rewindSerialKey`);
 * - inside every string, free text included (a stored LLM prompt holds earlier
 *   tool results): a `name=value` pair whose name is a credential, as in a URL
 *   or query string, a `"name": "value"` pair of JSON written into a string,
 *   the value of an `Authorization` header, and a credential-shaped `Bearer`
 *   or `Basic` value.
 *
 * A non-string value under a credential key (a `{ last4 }` description, a
 * field error list) is kept and searched. Counts such as `promptTokens` are
 * left alone: only a key that ends in `token`, not `tokens`, counts. A single
 * word after a bare `Basic` or `Bearer` is a title ("Basic Instinct",
 * "Bearer Instruments Part One"), not a credential. Text that is not JSON gets
 * the string rules.
 *
 * Every string of every result passes through these rules, member-chosen
 * text included (a player's name), so each runs in one pass over its input:
 * a long run of name characters is read once, never re-split.
 *
 * @module lib/mcp/redact
 */

import { ENCRYPTED_FIELDS, FREE_TEXT_FIELDS } from "@/lib/db/encrypted-fields"

/** @internal Exported for the redaction tests. */
export const REDACTED = "[redacted]"

const normalise = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Normalised fragments that make a key a credential wherever they appear in it. */
const SECRET_FRAGMENTS = [
  "apikey",
  "secret",
  "password",
  "passwd",
  "passkey",
  "authorization",
  "cookie",
  "credential",
  "sharekey",
  "assetkey",
  "privatekey",
  "accesskey",
  "sessionkey",
]

/** The encrypted credential columns, normalised: every encrypted field that is not free text. */
const ENCRYPTED_CREDENTIALS: ReadonlySet<string> = new Set(
  Object.entries(ENCRYPTED_FIELDS).flatMap(([model, fields]) => fields.filter((field) => !FREE_TEXT_FIELDS[model]?.includes(field)).map(normalise))
)

/** Words that make a name in a `name=value` or `"name": "value"` pair inside a string a credential. */
const SECRET_WORD = String.raw`token|api[_-]?key|secret|password|passwd|passkey|authorization`
/**
 * A credential name, captured as group 1: the whole run of name characters,
 * read once by a lookahead (which is never backtracked into, so a long
 * hyphenated run costs one pass), then checked for a secret word. A name
 * ending in "tokens" is a count (max_tokens=4096), as in the key rule.
 */
const SECRET_NAME = String.raw`(?=([\w-]+))\1(?<=(?:${SECRET_WORD})[\w-]*)(?<!tokens)`
const SECRET_PAIR = new RegExp(String.raw`(?<![\w-])${SECRET_NAME}=([^&\s"'<>]+)`, "gi")
// Groups: the name, the `": "` between, and the value
const SECRET_JSON_PAIR = new RegExp(String.raw`"${SECRET_NAME}("\s*:\s*")((?:[^"\\]|\\.)+)"`, "gi")
/**
 * Group 1 is an `Authorization` header name and scheme, whose value is always
 * a credential. Group 2 is a bare scheme, whose value is one only when it is
 * not a single word of letters (a title, at most followed by a full stop).
 */
const AUTH_SCHEME =
  /\b([Aa]uthorization[\s"':=]*(?:Bearer|Basic))\s+[A-Za-z0-9._~+/=-]{8,}|\b(Bearer|Basic)\s+(?![A-Z]?[a-z]+\.?(?![A-Za-z0-9._~+/=-]))[A-Za-z0-9._~+/=-]{8,}/g

/**
 * Whether a key names a credential, with case and punctuation ignored.
 *
 * @internal Exported for the redaction tests.
 */
export function isCredentialKey(key: string): boolean {
  const name = normalise(key)
  return name.endsWith("token") || ENCRYPTED_CREDENTIALS.has(name) || SECRET_FRAGMENTS.some((fragment) => name.includes(fragment))
}

function redactString(value: string): string {
  return value
    .replace(SECRET_PAIR, `$1=${REDACTED}`)
    .replace(SECRET_JSON_PAIR, `"$1$2${REDACTED}"`)
    .replace(AUTH_SCHEME, (_match, header: string | undefined, scheme: string | undefined) => `${header ?? scheme} ${REDACTED}`)
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value)
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, typeof item === "string" && item !== "" && isCredentialKey(key) ? REDACTED : redactValue(item)])
  )
}

/** A tool's result text with credentials redacted, and whether anything was. */
export function redactCredentials(text: string): { text: string; redacted: boolean } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const next = redactString(text)
    return { text: next, redacted: next !== text }
  }
  const next = JSON.stringify(redactValue(parsed))
  // Unchanged data keeps the text the tool wrote
  return next === JSON.stringify(parsed) ? { text, redacted: false } : { text: next, redacted: true }
}
