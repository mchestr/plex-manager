import { getDiscordPortalUrl } from "@/lib/discord/config"
import { MarkType } from "@/lib/generated/prisma/client"

/**
 * What happened to the member's Plex watch status after a mark: `synced`,
 * skipped for want of their Plex sign-in, `failed`, or `not_applicable` (the
 * mark is not FINISHED_WATCHING).
 */
export type WatchStatusSync = "synced" | "no_plex_sign_in" | "failed" | "not_applicable"

/**
 * Human-readable label for a {@link MarkType}.
 *
 * Single source of truth shared by every mark surface (slash command replies,
 * the `!`-prefixed command flow, and the chatbot executor). Previously this
 * logic was duplicated as `getMarkTypeLabel` in the Discord command module and
 * `formatMarkType` in the chatbot executor.
 *
 * @param markType - The mark type to label.
 * @returns A sentence-case, space-separated label (e.g. `"Finished watching"`).
 */
export function getMarkTypeLabel(markType: MarkType): string {
  switch (markType) {
    case MarkType.FINISHED_WATCHING:
      return "Finished watching"
    case MarkType.NOT_INTERESTED:
      return "Not interested"
    case MarkType.KEEP_FOREVER:
      return "Keep forever"
    case MarkType.REWATCH_CANDIDATE:
      return "Rewatch candidate"
    case MarkType.POOR_QUALITY:
      return "Poor quality"
    case MarkType.WRONG_VERSION:
      return "Wrong version"
    default:
      return markType
  }
}

/**
 * The sentence a reply adds about the member's Plex watch status, or "" when
 * there is nothing to say (`not_applicable`).
 */
export function watchStatusNote(watched: WatchStatusSync): string {
  switch (watched) {
    case "synced":
      return "Your Plex watch status is updated."
    case "no_plex_sign_in":
      return `Saved. I can't update your Plex watch status, because Plex Manager doesn't have your Plex sign-in. Sign in with Plex at ${getDiscordPortalUrl()}, then try again.`
    case "failed":
      return "Saved, but Plex didn't answer, so your Plex watch status is unchanged. Try again later."
    case "not_applicable":
      return ""
  }
}
