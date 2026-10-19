/**
 * Redaction applied to every log line, in every environment (SEC-54).
 *
 * ## Overview
 *
 * The logger passes each message through {@link sanitizeText} and each
 * metadata value through {@link sanitizeValue}, so no line carries a share
 * token, card asset key, OAuth code or state, PIN id, invite code, secret or
 * full client IP. Development logs get pasted into issues too, so nothing here
 * depends on `NODE_ENV`.
 *
 * ## Rules ({@link REDACT_RULES})
 *
 * - `queryKeys`: the value of `key=value` becomes `[REDACTED]`, wherever the
 *   pair appears: a URL's query or fragment, or a bare `apikey=...` in a
 *   message. Keys match case-insensitively.
 * - `bearerPaths`: the path segment after one of these prefixes is a bearer
 *   credential and becomes `[masked]`; the rest of the path stays readable.
 * - `fieldSubstrings` and `fieldNames`: a metadata key containing one of the
 *   first, or equal to one of the second, has its value replaced. Booleans
 *   pass, and numbers pass a substring match, so `hasToken: true` and
 *   `inputTokens: 1200` stay useful.
 * - `ipKeys`: the value becomes its network through {@link maskIp}.
 *
 * Strings also lose emails, URL credentials and long random-looking values;
 * UUIDs (request ids) pass unchanged. An `Error` anywhere, its `cause`
 * included, becomes `{ name, message, code?, stack, cause? }`.
 *
 * @module
 *
 * @example
 * ```ts
 * sanitizeText('GET /rewind/s/abc123?year=2026&code=xyz')
 * // 'GET /rewind/s/[masked]?year=2026&code=[REDACTED]'
 * maskIp('203.0.113.7') // '203.0.113.0/24'
 * ```
 */

const MASKED = "[masked]"
const REDACTED = "[REDACTED]"

/** @internal Exported for the table-driven tests. */
export const REDACT_RULES = {
  queryKeys: [
    "token", "x-plex-token", "apikey", "api_key", "key", "auth", "password", "secret",
    "code", "state", "share", "s", "plexPinId", "pinId", "inviteCode", "session_id",
  ],
  /** `/wrapped/share/` also covers `/api/wrapped/share/`. */
  bearerPaths: ["/rewind/s/", "/wrapped/share/", "/api/rewind/card/s/", "/invite/"],
  fieldSubstrings: [
    "token", "apikey", "api_key", "password", "secret", "authorization", "cookie",
    "session", "email", "credentials",
  ],
  fieldNames: ["state", "pinid", "plexpinid", "invitecode", "assetkey", "sharekey"],
  ipKeys: ["ip", "clientip", "x-forwarded-for", "x-real-ip"],
} as const

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")

const QUERY_PAIR = new RegExp(
  `(^|[^A-Za-z0-9_-])(${REDACT_RULES.queryKeys.map(escape).join("|")})=([^&#\\s"',;)]*)`,
  "gi"
)
const BEARER_SEGMENT = new RegExp(`(${REDACT_RULES.bearerPaths.map(escape).join("|")})[^/?#\\s"'<>]+`, "g")
const URL_CREDENTIALS = /(\/\/)[^/\s:@]+:[^/\s@]+@/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RANDOM_LOOKING = /^[A-Za-z0-9_-]{33,}$/

/** Masks credentials in free text: URLs, paths, `key=value` pairs and emails. */
export function sanitizeText(text: string): string {
  return text
    .replace(URL_CREDENTIALS, `$1${REDACTED}@`)
    .replace(BEARER_SEGMENT, `$1${MASKED}`)
    .replace(QUERY_PAIR, `$1$2=${REDACTED}`)
    .replace(EMAIL, "[REDACTED_EMAIL]")
}

function maskOneIp(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i.exec(ip)
  if (v4) {
    return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`
  }
  if (ip.includes(":") && /^[0-9a-f:]+$/i.test(ip)) {
    const head = ip.split("::")[0]
    const hextets = [...(head ? head.split(":") : []), "0", "0", "0"].slice(0, 3)
    return `${hextets.map((h) => (parseInt(h, 16) || 0).toString(16)).join(":")}::/48`
  }
  return MASKED
}

/**
 * An IP address as its network: the /24 for IPv4 and the /48 for IPv6. A
 * comma-separated `x-forwarded-for` list masks each entry; anything that is
 * not an IP becomes `[masked]`.
 *
 * @internal
 */
export function maskIp(value: string): string {
  return value.split(",").map((part) => maskOneIp(part.trim())).join(", ")
}

function sanitizeString(value: string): string {
  if (UUID.test(value)) return value
  if (RANDOM_LOOKING.test(value)) return REDACTED
  return sanitizeText(value)
}

function serializeError(error: Error, seen: WeakSet<object>): Record<string, unknown> {
  const code = (error as { code?: unknown }).code
  return {
    name: error.name,
    message: sanitizeText(error.message),
    ...((typeof code === "string" || typeof code === "number") && { code }),
    stack: error.stack === undefined ? undefined : sanitizeText(error.stack),
    ...(error.cause !== undefined && { cause: sanitizeValue(error.cause, seen) }),
  }
}

function sanitizeField(key: string, value: unknown, seen: WeakSet<object>): unknown {
  const lower = key.toLowerCase()
  if ((REDACT_RULES.ipKeys as readonly string[]).includes(lower)) {
    return typeof value === "string" ? maskIp(value) : MASKED
  }
  if (value === null || value === undefined || typeof value === "boolean") {
    return value
  }
  // A substring match spares numbers, so `inputTokens: 1200` stays readable;
  // an exact name (a numeric PIN id) never does
  if (
    (REDACT_RULES.fieldNames as readonly string[]).includes(lower) ||
    (typeof value !== "number" && REDACT_RULES.fieldSubstrings.some((field) => lower.includes(field)))
  ) {
    return REDACTED
  }
  return sanitizeValue(value, seen)
}

/** A copy of `value` that is safe to log, under every rule above. */
export function sanitizeValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return sanitizeString(value)
  if (value === null || typeof value !== "object" || value instanceof Date) return value
  // `seen` holds the ancestors only, so a value shared by two siblings logs twice.
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  try {
    if (value instanceof Error) return serializeError(value, seen)
    if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen))

    const sanitized: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeField(key, val, seen)
    }
    return sanitized
  } finally {
    seen.delete(value)
  }
}
