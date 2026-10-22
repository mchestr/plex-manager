/**
 * The remove-member dialog's copy for a dry run (P11.13): one line per
 * external effect, and one per inventory table that has rows. Pure, so the
 * client dialog reads it.
 *
 * @module lib/members/erase-copy
 */

import type { ErasePlan } from "@/lib/members/erase"
import type { InventoryCounts } from "@/lib/members/erase-inventory"

const LABELS: Record<keyof InventoryCounts, string> = {
  user: "Account",
  plexWrapped: "Rewinds",
  rewindGeneration: "Rewind runs",
  rewindShare: "Share links",
  rewindShareVisitDay: "Share link visit days",
  rewindView: "Rewind views",
  wrappedShareVisit: "Old share link visits",
  rewindPrefs: "Rewind settings",
  rewindExclusion: "Hidden titles",
  llmUsage: "AI usage records",
  llmUsageAnonymised: "Admin AI records about them (text removed)",
  chatConversation: "Assistant conversations",
  discordChatSession: "Discord chat sessions",
  discordCommandLog: "Discord command log entries",
  discordPendingSelection: "Pending Discord selections",
  discordConnection: "Discord link",
  discordOAuthState: "Discord link attempts",
  userMediaMark: "Marked titles",
  watchlistSyncSettings: "Watchlist sync settings",
  watchlistSyncHistory: "Watchlist history items",
  inviteUsage: "Invite redemptions",
  subscription: "Subscription record",
}

/** The tables with rows, in inventory order: `{ key, label, count }`. */
export function countLines(counts: InventoryCounts): { key: keyof InventoryCounts; label: string; count: number }[] {
  return (Object.keys(LABELS) as (keyof InventoryCounts)[])
    .filter((key) => counts[key] > 0)
    .map((key) => ({ key, label: LABELS[key], count: counts[key] }))
}

/** What removal does outside this app, one sentence each. */
export function planLines(plan: ErasePlan): string[] {
  const lines: string[] = []
  if (plan.cancelStripe) lines.push("Cancels their Stripe subscription now.")
  if (plan.services.includes("plex")) lines.push("Removes their access to the Plex server.")
  if (plan.services.includes("jellyfin")) lines.push("Disables their Jellyfin account.")
  if (plan.discordLinked) lines.push("Clears their Discord role and revokes the Discord link.")
  lines.push("Signs them out everywhere.")
  return lines
}
