/**
 * The `/mark` slash command (Step 12).
 *
 * ## Overview
 *
 * Replaces the legacy `!`-prefixed media-marking flow
 * (`lib/discord/commands/media-marking.ts`) with a single slash command that
 * carries five subcommands — `finished`, `keep`, `notinterested`, `rewatch`,
 * `badquality` — each taking a required `title` option. The old "reply with a
 * number 1-5" disambiguation is replaced by a discord.js string select menu.
 *
 * ## Flow
 *
 * ```
 * /mark <sub> title:<q>
 *   │
 *   ├─ not linked ─────────────► ephemeral "link your account" nudge
 *   ├─ no active Plex server ──► ephemeral error
 *   ├─ search → 0 results ─────► ephemeral "no matches"
 *   ├─ search → 1 result ──────► applyMark → ephemeral confirmation
 *   └─ search → 2-25 results ──► persist pending selection (DB) + reply with a
 *                                 StringSelectMenu (ephemeral)
 *                                    │
 *                                    └─ user picks ─► component handler:
 *                                         findByCustomId → applyMark →
 *                                         interaction.update() confirmation →
 *                                         deleteById
 * ```
 *
 * The Plex search is potentially slow, so `handle` defers the reply
 * (ephemerally) before searching, then edits it — comfortably inside Discord's
 * 3s acknowledgement window.
 *
 * ## custom_id scheme
 *
 * The select menu's `custom_id` is `mark:select:<token>` where `<token>` is a
 * random id. The full string is stored as the pending selection's `customId`,
 * so the component handler resolves the parked results by looking the whole
 * `custom_id` back up via {@link findByCustomId}. The `mark:select:` prefix is
 * how the interaction router attributes the component back to this command.
 */

import { randomUUID } from "crypto"
import {
  ActionRowBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type StringSelectMenuInteraction,
} from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { MarkType } from "@/lib/generated/prisma/client"
import { searchPlexMedia, type PlexMediaItem } from "@/lib/connections/plex"
import {
  getActivePlexServerConfig,
  type PlexServerConfig,
} from "@/lib/connections/plex-config"
import { applyMark } from "@/lib/discord/media/mark-media"
import { getMarkTypeLabel } from "@/lib/discord/media/mark-labels"
import { createLogger } from "@/lib/utils/logger"
import type {
  ComponentHandler,
  InteractionContext,
  SlashCommand,
} from "../registry"
import { requireLinkedUser } from "../require-linked-user"
import {
  createPendingSelection,
  deleteById,
  findByCustomId,
} from "./pending-store"

const logger = createLogger("DISCORD_MARK_COMMAND")

/** `custom_id` prefix for `/mark`'s disambiguation select menu. */
export const MARK_SELECT_PREFIX = "mark:select:"

/** Max results a Plex search can put in a single select menu (Discord cap). */
const MAX_SELECT_OPTIONS = 25

/**
 * Map a `/mark` subcommand name to the {@link MarkType} it applies. Mirrors the
 * legacy `MARK_COMMANDS` mapping, minus the `!` aliases (each subcommand is a
 * single canonical name).
 */
export const MARK_SUBCOMMANDS: Record<string, MarkType> = {
  finished: MarkType.FINISHED_WATCHING,
  keep: MarkType.KEEP_FOREVER,
  notinterested: MarkType.NOT_INTERESTED,
  rewatch: MarkType.REWATCH_CANDIDATE,
  badquality: MarkType.POOR_QUALITY,
}

/**
 * Human-readable, one-line label for a Plex item used in confirmations and
 * select-menu option labels (e.g. `"The Office - Pilot (2005)"`).
 * @internal
 */
function formatItemLabel(item: PlexMediaItem): string {
  const titleDisplay = item.grandparentTitle
    ? `${item.grandparentTitle} - ${item.title}`
    : item.parentTitle
      ? `${item.parentTitle} - ${item.title}`
      : item.title
  const yearDisplay = item.year ? ` (${item.year})` : ""
  return `${titleDisplay}${yearDisplay}`
}

/**
 * Optional season/episode descriptor for a select-menu option (e.g. `"S1E1"`),
 * or `undefined` when the item is not an episode.
 * @internal
 */
function formatItemDescription(item: PlexMediaItem): string | undefined {
  if (item.parentIndex && item.index) {
    return `S${item.parentIndex}E${item.index}`
  }
  return undefined
}

/**
 * Build the confirmation copy shown after a mark is applied.
 * @internal
 */
function buildConfirmation(item: PlexMediaItem, markType: MarkType, watchedSynced: boolean): string {
  const watchedNote =
    markType === MarkType.FINISHED_WATCHING && watchedSynced
      ? " and marked as watched in Plex"
      : ""
  return `✅ Marked "${formatItemLabel(item)}" as **${getMarkTypeLabel(markType)}**${watchedNote}.`
}

/**
 * Apply a mark for a single resolved item and edit the deferred reply with the
 * confirmation (or an unsupported-type error).
 * @internal
 */
async function markAndConfirm(
  interaction: ChatInputCommandInteraction,
  userId: string,
  item: PlexMediaItem,
  markType: MarkType,
  plexConfig: PlexServerConfig
): Promise<void> {
  const result = await applyMark({
    userId,
    item,
    markType,
    markedVia: "discord",
    plexConfig,
    channelId: interaction.channelId,
  })

  if (!result.ok) {
    await interaction.editReply({
      content: `Unsupported media type: ${result.mediaType}. Only movies, TV shows, and episodes are supported.`,
    })
    return
  }

  await interaction.editReply({
    content: buildConfirmation(item, markType, result.watchedSynced),
  })
}

/**
 * Handle a `/mark <sub> title:<q>` invocation.
 * @internal
 */
async function handleMark(ctx: InteractionContext): Promise<void> {
  const { interaction } = ctx

  const user = await requireLinkedUser(ctx, { action: "marking media" })
  if (!user) return

  const subcommand = interaction.options.getSubcommand()
  const markType = MARK_SUBCOMMANDS[subcommand]
  if (!markType) {
    logger.error("Unknown /mark subcommand", undefined, { subcommand })
    await interaction.reply({
      content: "Unknown mark type. Please try again.",
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const title = interaction.options.getString("title", true).trim()

  // Plex search may be slow; ack now (ephemerally) so we stay under Discord's 3s
  // window, then edit the reply with the result.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const plexConfig = await getActivePlexServerConfig()
  if (!plexConfig) {
    await interaction.editReply({
      content: "No active Plex server configured. Please contact an admin.",
    })
    return
  }

  const searchResult = await searchPlexMedia(plexConfig, title)
  if (!searchResult.success || !searchResult.data) {
    await interaction.editReply({
      content: `Failed to search for "${title}": ${searchResult.error || "Unknown error"}`,
    })
    return
  }

  const results = searchResult.data

  if (results.length === 0) {
    await interaction.editReply({
      content: `No media found matching "${title}". Try a different search term.`,
    })
    return
  }

  if (results.length === 1) {
    await markAndConfirm(interaction, user.id, results[0], markType, plexConfig)
    return
  }

  // Multiple matches — park the candidates and present a select menu.
  const options = results.slice(0, MAX_SELECT_OPTIONS)
  const customId = `${MARK_SELECT_PREFIX}${randomUUID()}`

  await createPendingSelection({
    discordUserId: ctx.discordUserId,
    channelId: interaction.channelId,
    customId,
    markType,
    results: options,
  })

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Select the correct match")
    .addOptions(
      options.map((item, index) => {
        const description = formatItemDescription(item)
        return {
          label: formatItemLabel(item).slice(0, 100),
          value: String(index),
          ...(description ? { description: description.slice(0, 100) } : {}),
        }
      })
    )

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)

  await interaction.editReply({
    content: `Found multiple matches for "${title}". Select the correct one:`,
    components: [row],
  })
}

/**
 * Handle a select-menu response for a parked `/mark` disambiguation.
 *
 * Resolves the pending selection by the interaction's `custom_id`, applies the
 * mark for the chosen item, collapses the menu into a confirmation via
 * `interaction.update()`, and deletes the pending row. An expired or missing
 * selection is handled gracefully with an ephemeral notice.
 * @internal
 */
async function handleSelect(interaction: MessageComponentInteraction): Promise<void> {
  const select = interaction as StringSelectMenuInteraction

  const pending = await findByCustomId(select.customId)
  if (!pending) {
    await select.update({
      content: "That selection has expired. Please run the command again.",
      components: [],
    })
    return
  }

  // Verify ownership BEFORE touching the pending selection (index lookup /
  // deleteById), so a non-owner interaction can never mutate another user's
  // pending state. Defence in depth — the picker is ephemeral, but ordering the
  // authorization check first removes the gap entirely.
  const verification = await verifyPendingOwner(pending.discordUserId, select.user.id)
  if (!verification.ok) {
    await select.update({
      content: verification.message,
      components: [],
    })
    return
  }

  const index = Number(select.values[0])
  const item = pending.results[index]
  if (!item) {
    await select.update({
      content: "That selection is no longer valid. Please run the command again.",
      components: [],
    })
    await deleteById(pending.id)
    return
  }

  const plexConfig = await getActivePlexServerConfig()
  if (!plexConfig) {
    await select.update({
      content: "No active Plex server configured. Please contact an admin.",
      components: [],
    })
    await deleteById(pending.id)
    return
  }

  const result = await applyMark({
    userId: verification.userId,
    item,
    markType: pending.markType,
    markedVia: "discord",
    plexConfig,
    channelId: select.channelId ?? pending.channelId,
  })

  const content = result.ok
    ? buildConfirmation(item, pending.markType, result.watchedSynced)
    : `Unsupported media type: ${result.mediaType}. Only movies, TV shows, and episodes are supported.`

  await select.update({ content, components: [] })
  await deleteById(pending.id)
}

/**
 * Verify that the Discord user clicking the menu still owns the parked selection
 * and is linked to a Plex-manager user. Returns the internal user id on success.
 * @internal
 */
async function verifyPendingOwner(
  pendingDiscordUserId: string,
  clickingDiscordUserId: string
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  if (pendingDiscordUserId !== clickingDiscordUserId) {
    return { ok: false, message: "This selection belongs to someone else." }
  }

  const { verifyDiscordUser } = await import("@/lib/discord/services")
  const verified = await verifyDiscordUser(clickingDiscordUserId)
  if (!verified.linked || !verified.user) {
    return {
      ok: false,
      message:
        "You need to link your account before marking media. Use the link provided earlier.",
    }
  }
  return { ok: true, userId: verified.user.id }
}

const selectComponent: ComponentHandler = {
  customIdPrefix: MARK_SELECT_PREFIX,
  commandType: "SELECTION" as DiscordCommandType,
  handle: handleSelect,
}

/**
 * The `/mark` slash command: five media-mark subcommands plus a select-menu
 * component handler for multi-result disambiguation.
 */
export const markCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("mark")
    .setDescription("Mark a movie or show in your Plex library")
    .addSubcommand((sub) =>
      sub
        .setName("finished")
        .setDescription("Mark as finished watching (also marks watched in Plex)")
        .addStringOption((option) =>
          option.setName("title").setDescription("Title to search for").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("keep")
        .setDescription("Mark as keep forever (protected from auto-deletion)")
        .addStringOption((option) =>
          option.setName("title").setDescription("Title to search for").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("notinterested")
        .setDescription("Mark as not interested (won't be recommended)")
        .addStringOption((option) =>
          option.setName("title").setDescription("Title to search for").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("rewatch")
        .setDescription("Mark as a rewatch candidate")
        .addStringOption((option) =>
          option.setName("title").setDescription("Title to search for").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("badquality")
        .setDescription("Report media as poor quality (may be re-downloaded)")
        .addStringOption((option) =>
          option.setName("title").setDescription("Title to search for").setRequired(true)
        )
    ) as SlashCommandBuilder,
  commandType: "MEDIA_MARK" as DiscordCommandType,
  handle: handleMark,
  components: [selectComponent],
}
