/**
 * The `/mymarks [type]` slash command (Step 20).
 *
 * ## Overview
 *
 * Shows the *requesting* user their own {@link UserMediaMark}s as an ephemeral
 * embed, grouped by {@link MarkType}. An optional `type` picker narrows the list
 * to a single mark type.
 *
 * ## Self-scoping (why not `getUserMediaMarks`)
 *
 * `actions/user-marks.ts#getUserMediaMarks` self-scopes via
 * `getServerSession(authOptions)` — but a Discord interaction has no NextAuth
 * session. The router resolves the invoking Discord account to a linked
 * Plex-manager user (`verifyDiscordUser`) and hands it to the command as
 * `ctx.verifiedUser.user`. So this command queries `prisma.userMediaMark`
 * directly, mirroring the action's `where`/`orderBy`, but keyed on
 * `verifiedUser.user.id` (never a session). This guarantees a user only ever
 * sees their own marks.
 *
 * ## Embed limits
 *
 * Discord caps an embed at ≤25 fields, ≤1024 chars/field, ≤256 chars/field-name,
 * and ≤6000 chars total. Marks are grouped into one field per mark type; each
 * group lists up to {@link MAX_LINES_PER_GROUP} entries and each field's value is
 * hard-truncated to the char limit. When the fetched set exceeds what fits, the
 * embed description carries a `showing N of M` note.
 */

import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { MarkType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getMarkTypeLabel } from "@/lib/discord/media/mark-labels"
import { createLogger } from "@/lib/utils/logger"
import type { InteractionContext, SlashCommand } from "./registry"

const logger = createLogger("DISCORD_MYMARKS_COMMAND")

/** Discord embed structural limits. */
const EMBED_FIELD_VALUE_LIMIT = 1024
/** Max fields Discord allows in one embed. */
const MAX_EMBED_FIELDS = 25
/** Max entries listed per mark-type group (keeps each field under the value cap). */
const MAX_LINES_PER_GROUP = 15
/** Overall cap on marks rendered across all groups. */
const MAX_MARKS_RENDERED = 100

/**
 * The `type` option's choices: one per user-facing mark type, mapped to its
 * {@link MarkType} enum value. Mirrors the `/mark` subcommand vocabulary
 * (finished / keep / notinterested / rewatch / badquality).
 */
const TYPE_CHOICES: { name: string; value: MarkType }[] = [
  { name: "finished", value: MarkType.FINISHED_WATCHING },
  { name: "keep", value: MarkType.KEEP_FOREVER },
  { name: "notinterested", value: MarkType.NOT_INTERESTED },
  { name: "rewatch", value: MarkType.REWATCH_CANDIDATE },
  { name: "badquality", value: MarkType.POOR_QUALITY },
]

/** Ordered mark types for stable group ordering in the embed. */
const MARK_TYPE_ORDER: MarkType[] = TYPE_CHOICES.map((c) => c.value)

/** A single mark row projected to just the fields we render. */
type MarkRow = {
  title: string
  year: number | null
  markType: MarkType
  mediaType: string
  seasonNumber: number | null
  episodeNumber: number | null
  markedAt: Date
}

/**
 * Format one mark as a display line: `Title (Year) [SxEy] — <relative time>`.
 * @internal
 */
function formatMarkLine(mark: MarkRow): string {
  const yearPart = mark.year ? ` (${mark.year})` : ""
  const episodePart =
    mark.seasonNumber != null && mark.episodeNumber != null
      ? ` S${mark.seasonNumber}E${mark.episodeNumber}`
      : ""
  const when = `<t:${Math.floor(mark.markedAt.getTime() / 1000)}:R>`
  return `• ${mark.title}${yearPart}${episodePart} — ${when}`
}

/**
 * Group marks by {@link MarkType} in a stable, human order.
 * @internal
 */
function groupByType(marks: MarkRow[]): Map<MarkType, MarkRow[]> {
  const groups = new Map<MarkType, MarkRow[]>()
  for (const markType of MARK_TYPE_ORDER) {
    const rows = marks.filter((m) => m.markType === markType)
    if (rows.length > 0) {
      groups.set(markType, rows)
    }
  }
  // Any mark types not in the ordered list (e.g. WRONG_VERSION) trail after.
  for (const mark of marks) {
    if (!MARK_TYPE_ORDER.includes(mark.markType) && !groups.has(mark.markType)) {
      groups.set(
        mark.markType,
        marks.filter((m) => m.markType === mark.markType)
      )
    }
  }
  return groups
}

/**
 * Build the grouped embed. Caps the number of rendered marks and per-group
 * lines to stay within Discord's structural limits; adds a `showing N of M`
 * note to the description when the fetched set was larger than what is shown.
 * @internal
 */
function buildMarksEmbed(
  marks: MarkRow[],
  filterType: MarkType | null,
  total: number
): EmbedBuilder {
  // `marks` is already bounded to MAX_MARKS_RENDERED by the query; `total` is
  // the true count for the "showing N of M" note.
  const rendered = marks.slice(0, MAX_MARKS_RENDERED)

  const embed = new EmbedBuilder().setTitle(
    filterType ? `Your ${getMarkTypeLabel(filterType)} Marks` : "Your Marks"
  )

  const groups = groupByType(rendered)
  let renderedCount = 0

  for (const [markType, rows] of groups) {
    if (embed.data.fields && embed.data.fields.length >= MAX_EMBED_FIELDS) break

    const shown = rows.slice(0, MAX_LINES_PER_GROUP)
    renderedCount += shown.length

    const lines = shown.map(formatMarkLine)
    if (rows.length > shown.length) {
      lines.push(`…and ${rows.length - shown.length} more`)
    }

    embed.addFields({
      name: `${getMarkTypeLabel(markType)} (${rows.length})`,
      value: lines.join("\n").slice(0, EMBED_FIELD_VALUE_LIMIT),
    })
  }

  const descriptionParts: string[] = []
  if (renderedCount < total) {
    descriptionParts.push(`Showing ${renderedCount} of ${total} marks.`)
  }
  if (descriptionParts.length > 0) {
    embed.setDescription(descriptionParts.join(" "))
  }

  return embed
}

/**
 * Handle a `/mymarks [type]` invocation.
 * @internal
 */
async function handleMyMarks(ctx: InteractionContext): Promise<void> {
  const { interaction, verifiedUser } = ctx

  if (!verifiedUser.linked || !verifiedUser.user) {
    await interaction.reply({
      content:
        "You need to link your account before viewing your marks. Use the link provided earlier.",
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const userId = verifiedUser.user.id
  const filterType = interaction.options.getString("type") as MarkType | null

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const where: { userId: string; markType?: MarkType } = { userId }
    if (filterType) {
      where.markType = filterType
    }

    // Bound the query at the DB level (indexed on userId) instead of fetching
    // the whole history and slicing client-side; a separate count gives the
    // accurate total for the "showing N of M" note.
    const [marks, total] = (await Promise.all([
      prisma.userMediaMark.findMany({
        where,
        orderBy: { markedAt: "desc" },
        take: MAX_MARKS_RENDERED,
      }),
      prisma.userMediaMark.count({ where }),
    ])) as [MarkRow[], number]

    if (marks.length === 0) {
      await interaction.editReply({
        content: filterType
          ? `You have no marks of that type yet.`
          : "You haven't marked anything yet. Use `/mark` to get started.",
      })
      return
    }

    await interaction.editReply({
      embeds: [buildMarksEmbed(marks, filterType, total)],
    })
  } catch (error) {
    logger.error("Failed to fetch user marks", error, { userId })
    await interaction.editReply({
      content: "Sorry, I couldn't load your marks right now. Please try again later.",
    })
  }
}

/**
 * The `/mymarks [type]` slash command: shows the requesting user their own
 * media marks as an ephemeral, grouped embed.
 */
export const myMarksCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("mymarks")
    .setDescription("Show the media you've marked")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Only show marks of this type")
        .setRequired(false)
        .addChoices(...TYPE_CHOICES)
    ) as SlashCommandBuilder,
  commandType: "MEDIA_MARK" as DiscordCommandType,
  handle: handleMyMarks,
}
