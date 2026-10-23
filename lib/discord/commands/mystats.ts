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
 * Audit logging and the generic error fallback are handled by the interaction
 * router / audit wrapper (commandType {@link DiscordCommandType} `CHAT` — the
 * closest fit; there is no dedicated stats audit type).
 */

import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { isJellyfinOnly, JELLYFIN_COPY } from "@/lib/discord/copy"
import { getMemberYearStats, memberStatsYear } from "@/lib/discord/stats/member-stats"
import { hoursOf, type MemberYearStats } from "@/lib/discord/stats/year-stats"
import { formatHour } from "@/lib/rewind/format"
import { consume } from "@/lib/security/rate-limit"
import { retryAfterCopy } from "@/lib/security/rate-limit-messages"
import { formatDuration } from "@/lib/utils/format"
import type { InteractionContext, SlashCommand } from "./registry"
import { requireLinkedUser } from "./require-linked-user"

const NO_TAUTULLI =
  "Watch statistics are unavailable right now — no Tautulli server is configured. Please contact an admin."

const GENERIC_ERROR =
  "Sorry, I couldn't load your stats right now. Please try again in a moment."

const NO_DATA =
  "You don't have any watch stats yet for this year. Watch something and check back later!"

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
 * Build the ephemeral stats embed from a member's year stats.
 * @internal
 */
function buildStatsEmbed(stats: MemberYearStats): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📊 Your Watch Stats")
    .setDescription(
      `You've watched **${formatDuration(stats.totalMinutes, "long", { largestUnit: "day" })}** in ${stats.year} (${hoursOf(stats)} hours).`
    )
    .addFields(
      { name: "🎬 Movies", value: `${stats.counts.films}`, inline: true },
      { name: "📺 Shows", value: `${stats.counts.series}`, inline: true },
      { name: "🎞️ Episodes", value: `${stats.counts.episodes}`, inline: true }
    )

  if (stats.topShow) {
    embed.addFields({ name: "🏆 Top Show", value: scrub(stats.topShow), inline: true })
  }
  if (stats.topFilm) {
    embed.addFields({ name: "🥇 Top Movie", value: scrub(stats.topFilm), inline: true })
  }
  if (stats.longestStreakDays) {
    const days = stats.longestStreakDays
    embed.addFields({ name: "🔥 Longest Streak", value: `${days} ${days === 1 ? "day" : "days"}`, inline: true })
  }
  if (stats.peakHour !== null) {
    embed.addFields({
      name: "⏰ Peak Viewing Hour",
      value: formatHour(stats.peakHour, { locale: "en-US" }).replace(/\u00A0/g, " "),
      inline: true,
    })
  }

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

  const user = await requireLinkedUser(ctx, { action: "viewing your stats" })
  if (!user) return

  if (isJellyfinOnly(user.services)) {
    await interaction.reply({ content: JELLYFIN_COPY.mystats, flags: MessageFlags.Ephemeral })
    return
  }

  // A history read takes up to 20 pages, so it is limited per member (SEC-23)
  const limit = await consume("discord:mystats", user.id)
  if (!limit.ok) {
    await interaction.reply({
      content: `You've checked your stats a lot this hour. You can look again ${retryAfterCopy(limit.retryAfterSec)}.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // The read is slow; ack now (ephemerally) so we stay under Discord's 3s
  // window, then edit the reply with the result.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const { year, zone } = await memberStatsYear(user.timezone)
  const result = await getMemberYearStats(user.id, { year, zone, signal: AbortSignal.timeout(READ_LIMIT_MS) })

  if (!result.ok) {
    await interaction.editReply({ content: failureCopy(result.code) })
    return
  }
  if (result.stats.totalMinutes <= 0) {
    await interaction.editReply({ content: NO_DATA })
    return
  }

  await interaction.editReply({ embeds: [buildStatsEmbed(result.stats)] })
}

/**
 * The `/mystats` slash command: shows the caller their own watch stats as an
 * ephemeral embed.
 */
export const myStatsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("mystats")
    .setDescription(
      "See your own Plex watch stats for this year (only visible to you)"
    ) as SlashCommandBuilder,
  commandType: "CHAT" as DiscordCommandType,
  handle: handleMyStats,
}
