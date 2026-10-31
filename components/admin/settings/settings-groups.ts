import type { ConnectionStatus } from "@/lib/ui/status"

export type SettingsGroupId = "media" | "members" | "ai" | "discord" | "rewind" | "system"

/** The settings page's groups, in nav order. The page shows one at a time. */
export const SETTINGS_GROUPS: readonly { id: SettingsGroupId; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "members", label: "Members" },
  { id: "ai", label: "AI" },
  { id: "discord", label: "Discord" },
  { id: "rewind", label: "Rewind" },
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
export type SettingsNavStatuses = Record<"plex" | "tautulli" | "overseerr" | "other" | "stripe" | "ai" | "discord" | "rewind", ConnectionStatus>

/**
 * Every section's nav entry, in the order the page renders its groups and
 * sections, which the nav's "section in view" follows.
 */
export function settingsNavItems(status: SettingsNavStatuses): SettingsNavItem[] {
  return [
    { id: "plex", label: "Plex server", group: "media", status: status.plex },
    { id: "tautulli", label: "Tautulli", group: "media", status: status.tautulli },
    { id: "overseerr", label: "Overseerr", group: "media", status: status.overseerr },
    { id: "other", label: "Sonarr, Radarr, Jellyfin", group: "media", status: status.other },
    { id: "stripe", label: "Stripe billing", group: "members", status: status.stripe },
    { id: "request-tiers", label: "Request limits", group: "members" },
    { id: "ai", label: "AI provider", group: "ai", status: status.ai },
    { id: "assistant", label: "Assistant sources", group: "ai" },
    { id: "discord", label: "Discord", group: "discord", status: status.discord },
    { id: "channel-stats", label: "Channel stats", group: "discord" },
    { id: "rewind", label: "Rewind", group: "rewind", status: status.rewind },
    { id: "time-zone", label: "Time zone", group: "system" },
    { id: "privacy", label: "Privacy", group: "system" },
    { id: "system", label: "System information", group: "system" },
  ]
}
