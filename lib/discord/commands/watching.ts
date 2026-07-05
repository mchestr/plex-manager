/**
 * The `/watching` slash command (Step 22).
 *
 * ## Overview
 *
 * Shows the requesting user their OWN current Plex streams as an ephemeral
 * embed. Sessions are scoped to the caller's `plexUserId` the same way the
 * chatbot's `get_plex_sessions` executor scopes them in Discord context
 * (`actions/chatbot/executors/plex.ts`): the raw `MediaContainer.Metadata` list
 * is filtered to entries whose `User.id` (or `user_id`) equals the caller's Plex
 * user id. Because the result is self-scoped, no other viewer's activity is ever
 * rendered.
 *
 * ## Flow
 *
 * ```
 * /watching
 *   │
 *   ├─ not linked ─────────────► ephemeral "link your account" nudge
 *   ├─ defer (ephemeral) ──────► server calls are slow
 *   ├─ no active Plex server ──► ephemeral error
 *   ├─ fetch failure ──────────► ephemeral error
 *   ├─ no own sessions ────────► "You're not watching anything right now."
 *   └─ own sessions ───────────► ephemeral embed, one field per stream
 * ```
 *
 * Plex sessions scoped to the user are sufficient for this step; Tautulli
 * enrichment is intentionally omitted. All free text is passed through
 * {@link sanitizeDiscordResponse} as a privacy backstop.
 */

import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { createLogger } from "@/lib/utils/logger"
import type { InteractionContext, SlashCommand } from "./registry"
import { requireLinkedUser } from "./require-linked-user"

const logger = createLogger("DISCORD_WATCHING_COMMAND")

/** Friendly copy shown when the caller has no active streams. */
const EMPTY_STATE = "You're not watching anything right now."

/** Discord caps an embed at 25 fields; one field per active stream. */
const MAX_STREAM_FIELDS = 25

/**
 * Minimal shape of a Plex session entry we read. Matches the fields the raw
 * `/status/sessions` payload exposes (see `plex-sanitizer.ts`). `User.id` /
 * `user_id` carry the viewer identity used for self-scoping.
 * @internal
 */
interface PlexSession {
  type?: string
  title?: string
  grandparentTitle?: string
  parentTitle?: string
  parentIndex?: number | string
  index?: number | string
  year?: number | string
  duration?: number | string
  viewOffset?: number | string
  User?: { id?: string; title?: string }
  user_id?: string
  Player?: { product?: string; device?: string; platform?: string; state?: string }
  Session?: {
    location?: string
    transcodeDecision?: string
    videoDecision?: string
    audioDecision?: string
  }
  Media?: PlexMedia | PlexMedia[]
}

/** @internal */
interface PlexMedia {
  videoResolution?: string | number
}

/**
 * Coerce a value to an array (Plex serialises a single-element list as the bare
 * object rather than an array).
 * @internal
 */
function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Filter the session list to only the caller's own streams, mirroring the
 * `get_plex_sessions` executor's Discord scoping.
 * @internal
 */
function scopeToUser(sessions: PlexSession[], plexUserId: string): PlexSession[] {
  return sessions.filter(
    (session) => session.User?.id === plexUserId || session.user_id === plexUserId
  )
}

/**
 * Human-readable title for a session: `"Series · Sxx Eyy"` for episodes,
 * otherwise the movie/base title (with year when known).
 * @internal
 */
function formatTitle(session: PlexSession): string {
  const base = session.title?.trim() || "Unknown"
  const type = session.type?.toLowerCase()

  if (type === "episode") {
    const series = session.grandparentTitle?.trim() || base
    const se = formatSeasonEpisode(session)
    return se ? `${series} — ${base} (${se})` : `${series} — ${base}`
  }

  const year = normalizeNumber(session.year)
  return year !== undefined ? `${base} (${year})` : base
}

/**
 * `"S1E1"` descriptor for an episode, or empty when indices are absent.
 * @internal
 */
function formatSeasonEpisode(session: PlexSession): string {
  const season = normalizeNumber(session.parentIndex)
  const episode = normalizeNumber(session.index)
  if (season === undefined && episode === undefined) return ""
  const s = season !== undefined ? `S${season}` : ""
  const e = episode !== undefined ? `E${episode}` : ""
  return `${s}${e}`
}

/**
 * Playback progress as a whole-number percentage, or `undefined` when unknown.
 * @internal
 */
function formatProgress(session: PlexSession): number | undefined {
  const offset = normalizeNumber(session.viewOffset)
  const duration = normalizeNumber(session.duration)
  if (offset === undefined || duration === undefined || duration <= 0) return undefined
  return Math.round((offset / duration) * 100)
}

/**
 * Build the detail lines for a single stream (player, progress, quality/
 * transcode). Excludes any viewer-identifying fields — the list is already
 * self-scoped, so there is nothing to leak, and we keep it purely informational.
 * @internal
 */
function formatStreamDetail(session: PlexSession): string {
  const lines: string[] = []

  const player = session.Player?.product?.trim() || session.Player?.device?.trim()
  const platform = session.Player?.platform?.trim()
  if (player) {
    lines.push(platform ? `Playing on ${player} (${platform})` : `Playing on ${player}`)
  }

  const progress = formatProgress(session)
  if (progress !== undefined) {
    lines.push(`Progress: ${progress}%`)
  }

  const resolution = normalizeString(toArray(session.Media)[0]?.videoResolution)
  const decision =
    session.Session?.transcodeDecision ??
    session.Session?.videoDecision ??
    session.Session?.audioDecision
  const qualityParts: string[] = []
  if (resolution) qualityParts.push(formatResolution(resolution))
  if (decision) qualityParts.push(decision === "transcode" ? "Transcoding" : decision)
  if (qualityParts.length > 0) {
    lines.push(`Quality: ${qualityParts.join(" · ")}`)
  }

  return lines.length > 0 ? lines.join("\n") : "Streaming"
}

/** @internal */
function formatResolution(value: string): string {
  return /^\d+$/.test(value) ? `${value}p` : value
}

/**
 * Build the ephemeral embed listing the caller's active streams.
 * @internal
 */
function buildWatchingEmbed(sessions: PlexSession[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Now Watching")
    .setDescription(
      safeText(
        sessions.length === 1
          ? "Here's your current stream:"
          : `You have ${sessions.length} active streams:`
      )
    )

  for (const session of sessions.slice(0, MAX_STREAM_FIELDS)) {
    embed.addFields({
      name: safeText(formatTitle(session)).slice(0, 256) || "Unknown",
      value: safeText(formatStreamDetail(session)).slice(0, 1024) || "Streaming",
    })
  }

  return embed
}

/**
 * Run text through the Discord PII backstop, returning the sanitized string.
 * @internal
 */
function safeText(text: string): string {
  return sanitizeDiscordResponse(text).content
}

/**
 * Handle a `/watching` invocation: fetch the caller's active Plex streams and
 * reply with an ephemeral embed (or a friendly empty/error state).
 * @internal
 */
async function handleWatching(ctx: InteractionContext): Promise<void> {
  const { interaction } = ctx

  const user = await requireLinkedUser(ctx, {
    action: "I can show what you're watching",
  })
  if (!user) return

  // Plex calls are slow; ack now (ephemerally) to stay under Discord's 3s window.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const plexUserId = user.plexUserId
  if (!plexUserId) {
    await interaction.editReply({ content: EMPTY_STATE })
    return
  }

  const config = await getActivePlexServerConfig()
  if (!config) {
    await interaction.editReply({
      content: "No active Plex server configured. Please contact an admin.",
    })
    return
  }

  const result = await getPlexSessions(config)
  if (!result.success || !result.data) {
    logger.error("Failed to fetch Plex sessions for /watching", undefined, {
      error: result.error,
    })
    await interaction.editReply({
      content: "Sorry, I couldn't reach Plex to check your streams. Please try again shortly.",
    })
    return
  }

  const allSessions = toArray<PlexSession>(result.data?.MediaContainer?.Metadata)
  const mySessions = scopeToUser(allSessions, plexUserId)

  if (mySessions.length === 0) {
    await interaction.editReply({ content: EMPTY_STATE })
    return
  }

  await interaction.editReply({ embeds: [buildWatchingEmbed(mySessions)] })
}

/** @internal */
function normalizeNumber(value?: number | string | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** @internal */
function normalizeString(value?: string | number | null): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === "number") return String(value)
  return undefined
}

/**
 * The `/watching` slash command: shows the caller their own active Plex streams
 * as an ephemeral embed. No options.
 */
export const watchingCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("watching")
    .setDescription("See what you're currently watching") as SlashCommandBuilder,
  commandType: "CHAT" as DiscordCommandType,
  handle: handleWatching,
}
