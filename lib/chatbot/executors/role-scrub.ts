/**
 * Output scrubbing for a role below admin (a Support user on the web).
 *
 * ## Overview
 *
 * A tool's result reaches the model, and so the caller, as the executor built
 * it. For an admin that includes whatever the services return. For a scoped
 * role this module removes what must never reach them, by key name and by
 * value, at any depth:
 *
 * - keys that carry a credential (`apikey`, `token`, `secret`, `password`,
 *   `authorization`, `cookie`, ...), compared with case and punctuation
 *   ignored, so `X-Plex-Token`, `api_key` and `accessToken` all match;
 * - the personal fields `withoutPersonalFields` drops for everyone (email,
 *   addresses, per-user tokens);
 * - credentials inside strings, such as `?X-Plex-Token=...` or `apikey=...`
 *   in a URL, an `Authorization` header's value, and a `Bearer` or `Basic`
 *   token (a single word after a bare scheme is a title such as "Basic
 *   Instinct", and is kept).
 *
 * It over-redacts rather than under-redacts (a key such as `tokenCount` is dropped too), and an executor's own error text
 * is replaced by a fixed line, because upstream errors can carry internal URLs
 * and keys (SEC-50). The function is pure and never throws.
 *
 * Viewing history of other members stays visible, minus the personal fields:
 * it is what a support person needs to troubleshoot, and the Discord-style
 * per-user allowlist would make the tools useless for that.
 *
 * @module
 */

import "server-only"

import { withoutPersonalFields } from "./personal-fields"

/** What a scoped role gets for a tool that failed. */
export const ROLE_TOOL_UNAVAILABLE = "Error: that tool isn't available right now."

/** What a scoped role gets for a tool outside their permissions. */
export const ROLE_TOOL_NOT_PERMITTED = JSON.stringify({ error: "tool not permitted" })

/** @internal */
export const REDACTED = "[redacted]"

/** Normalised key fragments that mark a credential. */
const SECRET_KEY_FRAGMENTS = ["token", "apikey", "secret", "password", "passwd", "authorization", "cookie", "credential", "passkey"]

/**
 * A `name=value` pair in a URL or query string whose name is a credential.
 * The name is the whole run of name characters, read once by a lookahead
 * (which is never backtracked into, so a long hyphenated run costs one pass),
 * then checked for a secret word.
 */
const SECRET_PAIR = /(?<![\w-])(?=([\w-]+))\1(?<=(?:token|api[_-]?key|secret|password|passwd|passkey|authorization)[\w-]*)=([^&\s"'<>]+)/gi
/**
 * Group 1 is an `Authorization` header name and scheme, whose value is always
 * a credential. Group 2 is a bare scheme, whose value is one only when it is
 * not a single word of letters (a title such as "Basic Instinct", at most
 * followed by a full stop).
 */
const BEARER =
  /\b([Aa]uthorization[\s"':=]*(?:Bearer|Basic))\s+[A-Za-z0-9._~+/=-]{8,}|\b(Bearer|Basic)\s+(?![A-Z]?[a-z]+\.?(?![A-Za-z0-9._~+/=-]))[A-Za-z0-9._~+/=-]{8,}/g

function isSecretKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment))
}

function scrubString(value: string): string {
  // The scheme rule first: the pair rule would otherwise take "Authorization=Bearer" and leave the token
  return value
    .replace(BEARER, (_match, header: string | undefined, scheme: string | undefined) => `${header ?? scheme} ${REDACTED}`)
    .replace(SECRET_PAIR, `$1=${REDACTED}`)
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value)
  if (Array.isArray(value)) return value.map(scrubValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, field]) => (isSecretKey(key) ? [] : [[key, scrubValue(field)] as const]))
  )
}

/** `output` (a tool's string result) without credentials and personal fields. */
export function scrubForRole(output: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    // Not JSON (a plain-text summary): scrub it as a string
    return scrubString(output)
  }
  // A failure while scrubbing parsed data must not fall back to the raw output
  try {
    return JSON.stringify(scrubValue(withoutPersonalFields(parsed)))
  } catch {
    return ROLE_TOOL_UNAVAILABLE
  }
}
