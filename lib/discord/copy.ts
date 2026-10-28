/**
 * What the bot tells a member whose account is on Jellyfin when a command
 * only works with Plex (P11.12, GAP-25): a plain reason, never an empty
 * result that reads like "nothing happened".
 *
 * @module lib/discord/copy
 */

import type { AuthService } from "@/types/onboarding"

export const JELLYFIN_COPY = {
  mystats: "Stats use Plex watch history. Your account is on Jellyfin, so stats are not available yet.",
  watching: "This command shows Plex streams only. Your account is on Jellyfin.",
  mark: "`/mark` works with the Plex library only. Your account is on Jellyfin.",
} as const

/** A member on Jellyfin alone: every Plex-only command answers with {@link JELLYFIN_COPY}. */
export function isJellyfinOnly(services: readonly AuthService[]): boolean {
  return services.includes("jellyfin") && !services.includes("plex")
}

/** The assistant's reply when its answer was empty: the services it can help with, Jellyfin when one is active. */
export function assistantFallbackReply(jellyfinConfigured: boolean): string {
  const services = jellyfinConfigured ? "Plex, Jellyfin, Tautulli, Overseerr, Sonarr, or Radarr" : "Plex, Tautulli, Overseerr, Sonarr, or Radarr"
  return `Here's what I can help with: system status, queue issues, and download problems for ${services}.`
}
