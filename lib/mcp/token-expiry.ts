/** How long a new API token lasts. */
export const API_TOKEN_EXPIRIES = ["30d", "90d", "365d", "never"] as const
export type ApiTokenExpiry = (typeof API_TOKEN_EXPIRIES)[number]

export const API_TOKEN_EXPIRY_LABELS: Record<ApiTokenExpiry, string> = {
  "30d": "30 days",
  "90d": "90 days",
  "365d": "1 year",
  never: "Never",
}

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS: Record<Exclude<ApiTokenExpiry, "never">, number> = { "30d": 30, "90d": 90, "365d": 365 }

/** The expiry date for an option, or null for `never`. */
export function apiTokenExpiry(option: ApiTokenExpiry, now: Date): Date | null {
  return option === "never" ? null : new Date(now.getTime() + DAYS[option] * DAY_MS)
}
