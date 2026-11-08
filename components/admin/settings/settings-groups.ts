import type { SettingsHealth } from "@/lib/settings/connection-status"
import type { ConnectionStatus } from "@/lib/ui/status"

export type SettingsGroupId = "connections" | "billing" | "system"

/** The settings page's groups, in nav order. The page shows one at a time. */
export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = [
  { id: "connections", label: "Connections" },
  { id: "billing", label: "Billing" },
  { id: "system", label: "System" },
]

export interface SettingsNavItem {
  /** The section's anchor id. */
  id: string
  label: string
  group: SettingsGroupId
  /** Left out for a section with nothing to check (System information). */
  status?: ConnectionStatus
}

/** The health of each section that has one. */
export type SettingsNavStatuses = Record<"plex" | "tautulli" | "overseerr" | "other" | "stripe", ConnectionStatus>

/**
 * The `SettingsHealth` checks each of those sections shows (`other` is three
 * services). The remaining checks (AI, Discord, Rewind) are shown on their
 * own feature's page, so anything that counts what Settings shows reads this.
 */
export const SECTION_HEALTH_KEYS = {
  plex: ["plex"],
  tautulli: ["tautulli"],
  overseerr: ["overseerr"],
  other: ["sonarr", "radarr"],
  stripe: ["stripe"],
} as const satisfies Record<keyof SettingsNavStatuses, readonly (keyof SettingsHealth)[]>

/**
 * Every section's nav entry, in the order the page renders its groups and
 * sections, which the nav's "section in view" follows.
 */
export function settingsNavItems(status: SettingsNavStatuses): SettingsNavItem[] {
  return [
    { id: "plex", label: "Plex server", group: "connections", status: status.plex },
    { id: "tautulli", label: "Tautulli", group: "connections", status: status.tautulli },
    { id: "overseerr", label: "Overseerr", group: "connections", status: status.overseerr },
    { id: "other", label: "Sonarr, Radarr", group: "connections", status: status.other },
    { id: "email", label: "Email", group: "connections" },
    { id: "stripe", label: "Stripe billing", group: "billing", status: status.stripe },
    { id: "appearance", label: "Appearance", group: "system" },
    { id: "brand-images", label: "Logos and images", group: "system" },
    { id: "time-zone", label: "Time zone", group: "system" },
    { id: "api-access", label: "API access", group: "system" },
    { id: "privacy", label: "Privacy", group: "system" },
    { id: "system", label: "System information", group: "system" },
  ]
}
