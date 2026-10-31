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
 *   tool results, JSON-encoded), what `redactText` finds
 *   (`lib/security/redact-text.ts`, shared with the Support role's scrubber):
 *   a credential pair in a URL or query string, percent-encoded or not, in a
 *   header or config line (`X-Plex-Token: ...`), or in JSON or a dict written
 *   into a string, escaped or not; an `Authorization` header's credentials,
 *   in any letter case (a Bearer, Basic, Bot or Token token, or another
 *   scheme's token or auth-param list); and a token after a bare `Bearer` or
 *   `Basic`.
 *
 * A non-string value under a credential key (a `{ last4 }` description, a
 * field error list) is kept and searched. Counts such as `promptTokens` are
 * left alone: only a key that ends in `token`, not `tokens`, counts. Text that
 * is not JSON gets the string rules.
 *
 * @module lib/mcp/redact
 */

import { ENCRYPTED_FIELDS, FREE_TEXT_FIELDS } from "@/lib/db/encrypted-fields"
import { REDACTED as TEXT_REDACTED, redactText } from "@/lib/security/redact-text"

/** @internal Exported for the redaction tests. */
export const REDACTED = TEXT_REDACTED

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

/**
 * Whether a key names a credential, with case and punctuation ignored.
 *
 * @internal Exported for the redaction tests.
 */
export function isCredentialKey(key: string): boolean {
  const name = normalise(key)
  return name.endsWith("token") || ENCRYPTED_CREDENTIALS.has(name) || SECRET_FRAGMENTS.some((fragment) => name.includes(fragment))
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value)
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
    const next = redactText(text)
    return { text: next, redacted: next !== text }
  }
  const next = JSON.stringify(redactValue(parsed))
  // Unchanged data keeps the text the tool wrote
  return next === JSON.stringify(parsed) ? { text, redacted: false } : { text: next, redacted: true }
}
