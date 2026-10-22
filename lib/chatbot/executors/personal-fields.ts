import "server-only"

/**
 * Field names the admin assistant never needs: contact details, addresses and
 * per-user tokens. Tautulli puts them on its user, activity and history rows,
 * and Overseerr on every `requestedBy` user (SEC-42).
 */
const PERSONAL_KEYS = new Set(["email", "ip_address", "ip_address_public", "server_token", "user_token"])

/** `value` with every {@link PERSONAL_KEYS} field removed, at any depth. */
export function withoutPersonalFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPersonalFields)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PERSONAL_KEYS.has(key))
      .map(([key, field]) => [key, withoutPersonalFields(field)])
  )
}
