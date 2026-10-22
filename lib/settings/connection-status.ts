/**
 * The client-safe half of the settings connection health (P10.19): the
 * section keys, the result shape, the failure codes with their copy, and the
 * "worst status wins" rule. `getSettingsHealth()` in
 * `lib/settings/connection-health.ts` (server-only) fills it.
 *
 * @module lib/settings/connection-status
 */

import type { ConnectionStatus } from "@/lib/ui/status"

/** The cache tag of the service checks; actions that change a section's health update it. */
export const CONNECTION_HEALTH_TAG = "connection-health"

/** The checks `getSettingsHealth()` reports, one per settings section or listed service. */
const HEALTH_KEYS = [
  "plex",
  "tautulli",
  "overseerr",
  "ai",
  "discord",
  "stripe",
  "watchlist",
  "rewind",
  "sonarr",
  "radarr",
  "jellyfin",
  "prometheus",
] as const

export type HealthKey = (typeof HEALTH_KEYS)[number]

/** Why a check is not `ok`. A tester's own message never leaves the server. */
export type HealthCode =
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "UNREACHABLE"
  | "LLM_DISABLED"
  | "MISSING_SETUP"
  | "BOT_OFFLINE"
  | "REDIS_UNAVAILABLE"
  | "DEPENDENCY"

export interface SectionHealth {
  status: ConnectionStatus
  code: HealthCode | null
  /** ISO time of the check, or null when nothing was checked (not set up). */
  checkedAt: string | null
}

export type SettingsHealth = Record<HealthKey, SectionHealth>

const COPY: Record<HealthCode, string> = {
  TIMEOUT: "Nothing answered within 5 seconds.",
  UNAUTHORIZED: "The server refused the saved key.",
  NOT_FOUND: "Nothing answered at this address.",
  UNREACHABLE: "Can't connect with the saved settings.",
  LLM_DISABLED: "AI features are off, so Rewind uses template copy.",
  MISSING_SETUP: "Some required settings are missing.",
  BOT_OFFLINE: "The support bot has not renewed its lease in the last 90 seconds.",
  REDIS_UNAVAILABLE: "Redis is not answering.",
  DEPENDENCY: "A service this depends on is not working.",
}

const OK_COPY: Partial<Record<ConnectionStatus, string>> = {
  ok: "Connected with the saved settings.",
  disabled: "Off.",
  notConfigured: "Not set up yet.",
  untested: "Not checked yet.",
}

/** The sentence a section shows for its last check. */
export function healthMessage(health: SectionHealth): string {
  if (health.code) return COPY[health.code]
  return OK_COPY[health.status] ?? "Checked."
}

const RANK: Record<ConnectionStatus, number> = {
  notConfigured: 0,
  disabled: 1,
  untested: 2,
  ok: 3,
  incomplete: 4,
  degraded: 4,
  unreachable: 5,
}

/**
 * The worst of several statuses (5.6: a section with several features takes
 * the worst category among them). Empty input reads as `notConfigured`.
 *
 * @example
 * ```ts
 * worstStatus(["ok", "unreachable", "disabled"]) // "unreachable"
 * worstStatus([])                                // "notConfigured"
 * ```
 */
export function worstStatus(statuses: readonly ConnectionStatus[]): ConnectionStatus {
  return statuses.reduce<ConnectionStatus>((worst, status) => (RANK[status] > RANK[worst] ? status : worst), "notConfigured")
}
