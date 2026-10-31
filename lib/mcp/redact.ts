/**
 * The last guard on what an MCP tool returns: any string stored under the
 * name of a credential column is replaced before the result leaves the server.
 *
 * The loaders and actions behind the tools already show a saved secret only as
 * its last four (`describeSecret`, `{ last4 }`), so this should never fire. It
 * is here because a result reaches a model, and through a prompt injection
 * anyone who can steer it: a future read that returned a raw row would
 * otherwise hand over a server's API key.
 *
 * The names are the encrypted columns that hold credentials
 * (`ENCRYPTED_FIELDS` less `FREE_TEXT_FIELDS`): `apiKey`, `token`,
 * `plexAuthToken`, `botToken`, `clientSecret` and the rest. Free text that is
 * encrypted for privacy (an LLM prompt, a conversation title) is meant to be
 * read and is left alone, and so is a non-string value under one of the names
 * (a `{ last4 }` description, a field error list).
 *
 * @module lib/mcp/redact
 */

import { ENCRYPTED_FIELDS, FREE_TEXT_FIELDS } from "@/lib/db/encrypted-fields"

/** @internal Exported for the redaction tests. */
export const REDACTED = "[redacted]"

/**
 * The credential column names: every encrypted field that is not free text.
 *
 * @internal Exported for the redaction tests.
 */
export const CREDENTIAL_KEYS: ReadonlySet<string> = new Set(
  Object.entries(ENCRYPTED_FIELDS).flatMap(([model, fields]) => fields.filter((field) => !FREE_TEXT_FIELDS[model]?.includes(field)))
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** `value` with credential strings replaced, and whether any was. */
function redact(value: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false
    const items = value.map((item) => {
      const result = redact(item)
      changed ||= result.changed
      return result.value
    })
    return { value: items, changed }
  }
  if (!isRecord(value)) return { value, changed: false }
  let changed = false
  const entries = Object.entries(value).map(([key, item]) => {
    if (CREDENTIAL_KEYS.has(key) && typeof item === "string" && item !== "") {
      changed = true
      return [key, REDACTED] as const
    }
    const result = redact(item)
    changed ||= result.changed
    return [key, result.value] as const
  })
  return { value: Object.fromEntries(entries), changed }
}

/**
 * A tool's result text with credential strings redacted, and whether any were.
 * Text that is not JSON (some assistant tools answer in prose) is returned as is.
 */
export function redactCredentials(text: string): { text: string; redacted: boolean } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { text, redacted: false }
  }
  const { value, changed } = redact(parsed)
  return changed ? { text: JSON.stringify(value), redacted: true } : { text, redacted: false }
}
