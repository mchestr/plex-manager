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
 *   `sharekey` or `assetkey`, and every encrypted credential column
 *   (`ENCRYPTED_FIELDS` less `FREE_TEXT_FIELDS`, such as `rewindSerialKey`);
 * - inside every string, free text included (a stored LLM prompt holds earlier
 *   tool results): a `name=value` pair whose name is a credential, as in a URL
 *   or query string, a `"name": "value"` pair of JSON written into a string,
 *   and a `Bearer` or `Basic` value.
 *
 * A non-string value under a credential key (a `{ last4 }` description, a
 * field error list) is kept and searched. Counts such as `promptTokens` are
 * left alone: only a key that ends in `token`, not `tokens`, counts. Text that
 * is not JSON gets the string rules.
 *
 * @module lib/mcp/redact
 */

import { ENCRYPTED_FIELDS, FREE_TEXT_FIELDS } from "@/lib/db/encrypted-fields"

/** @internal Exported for the redaction tests. */
export const REDACTED = "[redacted]"

const normalise = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Normalised fragments that make a key a credential wherever they appear in it. */
const SECRET_FRAGMENTS = ["apikey", "secret", "password", "passwd", "passkey", "authorization", "cookie", "credential", "sharekey", "assetkey"]

/** The encrypted credential columns, normalised: every encrypted field that is not free text. */
const ENCRYPTED_CREDENTIALS: ReadonlySet<string> = new Set(
  Object.entries(ENCRYPTED_FIELDS).flatMap(([model, fields]) => fields.filter((field) => !FREE_TEXT_FIELDS[model]?.includes(field)).map(normalise))
)

/** Credential names in `name=value` and `"name": "value"` pairs inside a string. */
const SECRET_NAME = String.raw`[\w-]*(?:token|api[_-]?key|secret|password|passwd|passkey|authorization)[\w-]*`
const SECRET_PAIR = new RegExp(String.raw`\b(${SECRET_NAME})=([^&\s"'<>]+)`, "gi")
const SECRET_JSON_PAIR = new RegExp(String.raw`("${SECRET_NAME}"\s*:\s*")((?:[^"\\]|\\.)+)(")`, "gi")
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g

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
    .replace(SECRET_JSON_PAIR, `$1${REDACTED}$3`)
    .replace(AUTH_SCHEME, `$1 ${REDACTED}`)
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
