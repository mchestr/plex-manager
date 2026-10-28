/**
 * The `/mystats` slash command (Step 21, P11.12).
 *
 * ## Overview
 *
 * Shows the *requesting* member their own numbers for their current year (in
 * `User.timezone`, else the server zone) as an ephemeral embed. The numbers
 * come from {@link getMemberYearStats}: the stored v3 Rewind's facts when the
 * year's Rewind is complete, else at most 20 pages of the member's history for
 * the year, never an all-time scan (RWP-17). Media titles still go through
 * {@link sanitizeDiscordResponse} as a defence-in-depth backstop (design
 * §4.4, FR-8).
 *
 * ## Flow
 *
 * ```
 * /mystats
 *   │
 *   ├─ not linked ─────────────► ephemeral "link your account" nudge
 *   ├─ Jellyfin only ──────────► ephemeral explicit reason (GAP-25)
 *   ├─ over 5 an hour ─────────► ephemeral "try again in …" (no Tautulli call)
 *   └─ linked ─────────────────► deferReply (ephemeral; a history read is slow,
 *                                 must ack < 3s)
 *                                    │
 *                                    ├─ no active Tautulli server ─► ephemeral error
 *                                    ├─ read fails ────────────────► ephemeral error
 *                                    │                                (no internals leaked)
 *                                    ├─ no watch data ─────────────► friendly "no stats yet"
 *                                    └─ success ───────────────────► editReply with the embed
 * ```
 *
 * The embed also carries the member's request tier, the requests they have
 * left and the hours to the next tier ({@link requestLimitFields}) while the
 * request limits are on; a failed read leaves those fields out.
 *
 * Audit logging and the generic error fallback are handled by the interaction
 * router / audit wrapper (commandType {@link DiscordCommandType} `CHAT` — the
 * closest fit; there is no dedicated stats audit type).
 */

import { EmbedBuilder, MessageFlags } from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { isJellyfinOnly, JELLYFIN_COPY } from "@/lib/discord/copy"
import { getMemberYearStats, memberStatsYear } from "@/lib/discord/stats/member-stats"
import { hoursOf, type MemberYearStats } from "@/lib/discord/stats/year-stats"
import type { MemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { prisma } from "@/lib/prisma"
import { requestLimitFields } from "@/lib/request-tiers/discord-fields"
import { getMemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { formatHour } from "@/lib/rewind/format"
import { consume } from "@/lib/security/rate-limit"
import { retryAfterCopy } from "@/lib/security/rate-limit-messages"
import { canonicalLocale, formatDuration } from "@/lib/utils/format"
import { COMMAND_DEFINITIONS } from "./definitions"
import type { InteractionContext, SlashCommand } from "./registry"
import { requireLinkedUser } from "./require-linked-user"

const NO_TAUTULLI =
  "Watch stats are not available because this server has no Tautulli connection. Tell an admin."

const GENERIC_ERROR =
  "I could not load your stats. Try again in a few minutes."

const NO_DATA =
  "You have no watch stats for this year yet. They show here after you watch something."

/** A history read gives up after this long; a deferred reply may be edited for 15 minutes. */
const READ_LIMIT_MS = 90_000

/**
 * Pass a free-text value through the Discord scrubber backstop, returning the
 * (possibly redacted) text. Media titles are the caller's own data, but this
 * matches the rest of the Discord surface's defence-in-depth posture.
 * @internal
 */
function scrub(value: string): string {
  return sanitizeDiscordResponse(value).content || value
}

/**
 * Build the ephemeral stats embed from a member's year stats. `locale` is the
 * app locale (`Config.locale`), for the peak hour (P11.17).
 * @internal
 */
function buildStatsEmbed(stats: MemberYearStats, locale: string, limits: MemberRequestLimits | null): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📊 Your watch stats")
    .setDescription(
      `You've watched **${formatDuration(stats.totalMinutes, "long", { largestUnit: "day" })}** in ${stats.year} (${hoursOf(stats)} hours).`
    )
    .addFields(
      { name: "🎬 Movies", value: `${stats.counts.films}`, inline: true },
      { name: "📺 Shows", value: `${stats.counts.series}`, inline: true },
      { name: "🎞️ Episodes", value: `${stats.counts.episodes}`, inline: true }
    )

  if (stats.topShow) {
    embed.addFields({ name: "🏆 Top show", value: scrub(stats.topShow), inline: true })
  }
  if (stats.topFilm) {
    embed.addFields({ name: "🥇 Top movie", value: scrub(stats.topFilm), inline: true })
  }
  if (stats.longestStreakDays) {
    const days = stats.longestStreakDays
    embed.addFields({ name: "🔥 Longest streak", value: `${days} ${days === 1 ? "day" : "days"}`, inline: true })
  }
  if (stats.peakHour !== null) {
    embed.addFields({
      name: "⏰ Peak viewing hour",
      value: formatHour(stats.peakHour, { locale }).replace(/\u00A0/g, " "),
      inline: true,
    })
  }

  if (limits) embed.addFields(...requestLimitFields(limits))

  return embed
}

/** The reply for a read that gave no stats. @internal */
function failureCopy(code: "NO_PLEX_ACCOUNT" | "NO_TAUTULLI" | "UNAVAILABLE"): string {
  if (code === "NO_TAUTULLI") return NO_TAUTULLI
  return code === "NO_PLEX_ACCOUNT" ? NO_DATA : GENERIC_ERROR
}

/**
 * Handle a `/mystats` invocation.
 * @internal
 */
async function handleMyStats(ctx: InteractionContext): Promise<void> {
  const { interaction } = ctx

  const user = await requireLinkedUser(ctx, { action: "see your stats" })
  if (!user) return

  if (isJellyfinOnly(user.services)) {
    await interaction.reply({ content: JELLYFIN_COPY.mystats, flags: MessageFlags.Ephemeral })
    return
  }

  // A history read takes up to 20 pages, so it is limited per member (SEC-23)
  const limit = await consume("discord:mystats", user.id)
  if (!limit.ok) {
    await interaction.reply({
      content: `You looked at your stats too many times this hour. You can look again ${retryAfterCopy(limit.retryAfterSec)}.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // The read is slow; ack now (ephemerally) so we stay under Discord's 3s
  // window, then edit the reply with the result.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const { year, zone } = await memberStatsYear(user.timezone)
  const [result, config, limits] = await Promise.all([
    getMemberYearStats(user.id, { year, zone, signal: AbortSignal.timeout(READ_LIMIT_MS) }),
    prisma.config.findUnique({ where: { id: "config" }, select: { locale: true } }),
    // The embed is still useful without the limits, so a failed read leaves them out
    getMemberRequestLimits(user.id).catch(() => null),
  ])

  if (!result.ok) {
    await interaction.editReply({ content: failureCopy(result.code) })
    return
  }
  if (result.stats.totalMinutes <= 0) {
    await interaction.editReply({ content: NO_DATA })
    return
  }

  await interaction.editReply({ embeds: [buildStatsEmbed(result.stats, canonicalLocale(config?.locale), limits)] })
}

/**
 * The `/mystats` slash command: shows the caller their own watch stats as an
 * ephemeral embed.
 */
export const myStatsCommand: SlashCommand = {
  data: COMMAND_DEFINITIONS.mystats,
  commandType: "CHAT" as DiscordCommandType,
  handle: handleMyStats,
}
