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
 * - credentials inside strings, by the rules the MCP result guard shares
 *   (`redactText`, `lib/security/redact-text.ts`): a credential pair such as
 *   `?X-Plex-Token=...` or `apikey=...` in a URL, `X-Api-Key: ...` in a
 *   header, or `"apiKey": "..."` in JSON written into a string; an
 *   `Authorization` header's credentials; and a `Bearer` or `Basic` token (a
 *   single word after a bare scheme is a title such as "Basic Instinct", and
 *   is kept).
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

import { REDACTED as TEXT_REDACTED, redactText } from "@/lib/security/redact-text"

import { withoutPersonalFields } from "./personal-fields"

/** What a scoped role gets for a tool that failed. */
export const ROLE_TOOL_UNAVAILABLE = "Error: that tool isn't available right now."

/** What a scoped role gets for a tool outside their permissions. */
export const ROLE_TOOL_NOT_PERMITTED = JSON.stringify({ error: "tool not permitted" })

/** @internal */
export const REDACTED = TEXT_REDACTED

/** Normalised key fragments that mark a credential. */
const SECRET_KEY_FRAGMENTS = ["token", "apikey", "secret", "password", "passwd", "authorization", "cookie", "credential", "passkey"]

function isSecretKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment))
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value)
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
    return redactText(output)
  }
  // A failure while scrubbing parsed data must not fall back to the raw output
  try {
    return JSON.stringify(scrubValue(withoutPersonalFields(parsed)))
  } catch {
    return ROLE_TOOL_UNAVAILABLE
  }
}
