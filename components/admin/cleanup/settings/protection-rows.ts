/**
 * The words of each Global protections Edit row (UX 4.10, 5.4.1, 8.8,
 * `shots/10-settings-protections-editing.png`): the sentence before and after
 * the inline field, the name of the days field ("Days for: Played by
 * anyone", rule 8), the hints, the full sentence that names the checkbox,
 * and the count on the right. Pure and client-safe.
 *
 * @module components/admin/cleanup/settings/protection-rows
 */

import type { DaysId, ProtectionsDraft } from "@/components/admin/cleanup/settings/protections-draft"
import { plural } from "@/lib/cleanup/action-words"
import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { joinOr, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { globalProtectionSentence } from "@/lib/cleanup/preview/protection-words"
import type { SettingsProtection } from "@/lib/cleanup/types/list-parts"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"

/** A row's words: the sentence before the inline field, the words after it, and the name of its days field (UX 4.10 rule 8). */
interface RowWords {
  before: string
  after?: string
  days?: { id: DaysId; name: string }
  hint?: string
}

export const ROWS: Record<Exclude<GlobalProtectionId, "g10">, RowWords> = {
  g1: { before: "Kept by a member, until the Keep ends", hint: "Always on." },
  g3: { before: "Excluded by an admin, until its end date", hint: "Always on." },
  g2: { before: "Marked Keep forever by a member", hint: "From /mark in Discord and the assistant." },
  g4: { before: "Played by anyone in the last", after: "days", days: { id: "g4", name: "Played by anyone" } },
  g5: { before: "Someone is part-way through: an unfinished play in the last", after: "days", days: { id: "g5", name: "Someone is part-way through" } },
  g6: {
    before: "Added, or new episodes added, in the last",
    after: "days",
    days: { id: "g6", name: "Added, or new episodes added" },
    hint: "Uses the newer of the Plex and the Radarr or Sonarr dates.",
  },
  g7: { before: "Requested in the last", after: "days by a member with access who has not finished it", days: { id: "g7", name: "Requested" } },
  g8: { before: "On the watchlist of a member with access" },
  g9: { before: "Has a Radarr or Sonarr tag", hint: "Overseerr requester tags are hidden from this list, because they hold user names." },
  g11: { before: "The newest season of a continuing show" },
  g12: { before: "A member who played the show in the last", after: "days has not finished the season", days: { id: "g12", name: "A member who played the show" } },
  g13: { before: "In the Plex collection" },
}

export const G10_WARNING = "If you turn this off, a delete can break posters in members' Rewind."

/** `cleanup-protections-{gid}-{part}` (UX 10.2). */
export const fieldId = (id: GlobalProtectionId, part: string) => `cleanup-protections-${id}-${part}`
/** The test id part of a tag or a collection title: "Rainy Sunday Picks" gives `rainy-sunday-picks`. */
export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/** "Known only for the 2 members who use watchlist sync. ..." (UX 8.8). */
export function watchlistHint(members: number): string {
  if (members === 0) return "Known only for members who use watchlist sync, and no member uses it now. For other members this is unknown, not no."
  const who = members === 1 ? "the 1 member who uses" : `the ${members} members who use`
  return `Known only for ${who} watchlist sync. For other members this is unknown, not no.`
}

/** The right column: "Protects N titles", "Off", or the services it needs. */
export function countWords(protection: SettingsProtection, on: boolean, protects: number | null): string | null {
  const missing = protection.id === "g9" && protection.needsMissing.length < 2 ? [] : protection.needsMissing
  if (missing.length > 0) return `Needs ${joinOr(missing.map((service) => SERVICE_NAMES[service]))}`
  if (!on) return "Off"
  return protects === null ? null : `Protects ${plural(protects, protection.unit === "seasons" ? "season" : "title")}`
}

/** The full sentence of a row with the draft values: the checkbox's name (UX 4.10 rule 8). */
export function rowName(protection: SettingsProtection, draft: ProtectionsDraft, saved: ProtectionsOptions): string {
  const id = protection.id
  const words = id === "g10" ? null : ROWS[id]
  if (words?.days) return `${words.before} ${draft[words.days.id].days ?? saved[words.days.id].days} ${words.after ?? ""}`.trim()
  if (id === "g9" || id === "g13") return globalProtectionSentence(id, { ...saved, g9: draft.g9, g13: draft.g13 })
  return protection.sentence.replace(/^Season rules: (.)/, (_, first: string) => first.toUpperCase())
}

