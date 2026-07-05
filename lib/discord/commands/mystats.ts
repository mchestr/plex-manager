/**
 * The `/mystats` slash command (Step 21).
 *
 * ## Overview
 *
 * Shows the *requesting* user their own watch statistics for the current year as
 * an ephemeral embed. Unlike the LLM chat surface, the numbers here are the
 * caller's own data pulled straight from Tautulli — but the free-text fields
 * (media titles) are still routed through {@link sanitizeDiscordResponse} as a
 * defence-in-depth backstop, mirroring the rest of the Discord surface (design
 * §4.4, FR-8).
 *
 * ## Flow
 *
 * ```
 * /mystats
 *   │
 *   ├─ not linked ─────────────► ephemeral "link your account" nudge
 *   └─ linked ─────────────────► deferReply (ephemeral; Tautulli fetch is slow,
 *                                 must ack < 3s)
 *                                    │
 *                                    ├─ no active Tautulli server ─► ephemeral error
 *                                    ├─ fetch fails / throws ──────► ephemeral error
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
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { formatWatchTime } from "@/lib/utils/time-formatting"
import { fetchTautulliStatistics } from "@/lib/wrapped/statistics"
import type { TautulliStatisticsData } from "@/lib/wrapped/statistics-types"
import type { InteractionContext, SlashCommand } from "./registry"
import { requireLinkedUser } from "./require-linked-user"

const logger = createLogger("DISCORD_MYSTATS_COMMAND")

const LINK_NUDGE =
  "You need to link your account before viewing your stats. Use the link provided earlier."

const NO_TAUTULLI =
  "Watch statistics are unavailable right now — no Tautulli server is configured. Please contact an admin."

const GENERIC_ERROR =
  "Sorry, I couldn't load your stats right now. Please try again in a moment."

const NO_DATA =
  "You don't have any watch stats yet for this year. Watch something and check back later!"

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
 * Build the ephemeral stats embed from a user's Tautulli statistics.
 * @internal
 */
function buildStatsEmbed(stats: TautulliStatisticsData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📊 Your Watch Stats")
    .setDescription(
      `You've watched **${scrub(formatWatchTime(stats.totalWatchTime))}** this year.`
    )
    .addFields(
      { name: "🎬 Movies", value: `${stats.moviesWatched}`, inline: true },
      { name: "📺 Shows", value: `${stats.showsWatched}`, inline: true },
      { name: "🎞️ Episodes", value: `${stats.episodesWatched}`, inline: true }
    )

  const topShow = stats.topShows[0]
  if (topShow) {
    embed.addFields({
      name: "🏆 Top Show",
      value: scrub(topShow.title),
      inline: true,
    })
  }

  const topMovie = stats.topMovies[0]
  if (topMovie) {
    embed.addFields({
      name: "🥇 Top Movie",
      value: scrub(topMovie.title),
      inline: true,
    })
  }

  const { longestStreak, peakHour } = stats.derived
  if (longestStreak) {
    embed.addFields({
      name: "🔥 Longest Streak",
      value: `${longestStreak.days} ${longestStreak.days === 1 ? "day" : "days"}`,
      inline: true,
    })
  }
  if (peakHour) {
    embed.addFields({
      name: "⏰ Peak Viewing Hour",
      value: scrub(peakHour.label),
      inline: true,
    })
  }

  return embed
}

/**
 * Handle a `/mystats` invocation.
 * @internal
 */
async function handleMyStats(ctx: InteractionContext): Promise<void> {
  const { interaction } = ctx

  const user = await requireLinkedUser(ctx, { message: LINK_NUDGE })
  if (!user) return

  const { plexUserId, email } = user

  // Tautulli fetch is slow; ack now (ephemerally) so we stay under Discord's 3s
  // window, then edit the reply with the result.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const tautulli = await prisma.tautulli.findFirst({ where: { isActive: true } })
  if (!tautulli) {
    await interaction.editReply({ content: NO_TAUTULLI })
    return
  }

  if (!plexUserId) {
    await interaction.editReply({ content: NO_DATA })
    return
  }

  let stats: TautulliStatisticsData
  try {
    const result = await fetchTautulliStatistics(
      { url: tautulli.url, apiKey: tautulli.apiKey },
      plexUserId,
      email,
      new Date().getFullYear()
    )

    if (!result.success || !result.data) {
      // Log the raw internal error, but never surface it to the user.
      logger.error("Failed to fetch Tautulli stats for /mystats", undefined, {
        userId: user.id,
        error: result.error,
      })
      await interaction.editReply({ content: GENERIC_ERROR })
      return
    }
    stats = result.data
  } catch (error) {
    logger.error("Error fetching Tautulli stats for /mystats", error, {
      userId: user.id,
    })
    await interaction.editReply({ content: GENERIC_ERROR })
    return
  }

  if (stats.totalWatchTime <= 0) {
    await interaction.editReply({ content: NO_DATA })
    return
  }

  await interaction.editReply({ embeds: [buildStatsEmbed(stats)] })
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
