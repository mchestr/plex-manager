/**
 * The `/assistant` slash command (Step 13).
 *
 * ## Overview
 *
 * The AI assistant is primarily DM-based (see `routing/dm-router.ts`): a user
 * holds a multi-turn conversation by DMing the bot. `/assistant` is the
 * discoverable slash-command entry point that works from anywhere — including a
 * guild channel — and always answers ephemerally, pointing the user to DM the
 * bot for the ongoing conversation.
 *
 * ## Shape
 *
 * Discord does not allow a top-level option alongside subcommands on the same
 * command, so the design's `/assistant [prompt]` is realised as two
 * subcommands:
 *
 * - `/assistant ask prompt:<text>` — one-shot question; the answer is ephemeral.
 * - `/assistant reset` — clears the caller's conversation context.
 *
 * ## Flow
 *
 * ```
 * /assistant ask prompt:<q>
 *   │
 *   ├─ not linked ──► ephemeral "link your account" nudge
 *   └─ linked ──────► deferReply (ephemeral; LLM is slow) → handleDiscordChat
 *                      → editReply with the answer + a "continue in DM" note
 *
 * /assistant reset
 *   │
 *   ├─ not linked ──► ephemeral "link your account" nudge
 *   └─ linked ──────► clearDiscordChat → ephemeral confirmation
 * ```
 *
 * Audit logging and the generic error fallback are handled by the interaction
 * router / audit wrapper (commandType {@link DiscordCommandType} `CHAT`).
 */

import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { clearDiscordChat, handleDiscordChat } from "@/lib/discord/services"
import { createLogger } from "@/lib/utils/logger"
import type { InteractionContext, SlashCommand } from "./registry"
import {
  buildNotEntitledMessage,
  buildNotLinkedMessage,
  requireLinkedUser,
} from "./require-linked-user"

const logger = createLogger("DISCORD_ASSISTANT_COMMAND")

const LINK_NUDGE = buildNotLinkedMessage("using the assistant")

/** Appended to `/assistant ask` answers so users know where to continue. */
const CONTINUE_IN_DM_NOTE =
  "\n\n_Tip: DM me directly to keep the conversation going._"

/**
 * Handle `/assistant ask prompt:<q>`.
 *
 * Defers ephemerally (the LLM round-trip can exceed Discord's 3s ack window),
 * runs the chat, and edits the deferred reply with the answer plus a note that
 * the multi-turn conversation continues in DM.
 * @internal
 */
async function handleAsk(ctx: InteractionContext): Promise<void> {
  const { interaction, discordUserId, channelId } = ctx

  const user = await requireLinkedUser(ctx)
  if (!user) return

  const prompt = interaction.options.getString("prompt", true).trim()

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const response = await handleDiscordChat({
    discordUserId,
    channelId,
    message: prompt,
  })

  // Guard the (rare) case where entitlement lapsed between the gate above and the
  // chat call — handleDiscordChat re-checks and refuses non-linked/unentitled.
  if (response.linked === false) {
    await interaction.editReply({ content: LINK_NUDGE })
    return
  }
  if (response.entitled === false) {
    await interaction.editReply({ content: buildNotEntitledMessage() })
    return
  }

  if (!response.success || !response.message?.content) {
    logger.error("Assistant chat failed", undefined, {
      discordUserId,
      channelId,
      error: response.error,
    })
    await interaction.editReply({
      content:
        "Sorry, I couldn't reach the assistant right now. Please try again in a moment.",
    })
    return
  }

  await interaction.editReply({
    content: `${response.message.content}${CONTINUE_IN_DM_NOTE}`,
  })
}

/**
 * Handle `/assistant reset` — clear the caller's conversation context.
 * @internal
 */
async function handleReset(ctx: InteractionContext): Promise<void> {
  const { interaction, discordUserId, channelId } = ctx

  const user = await requireLinkedUser(ctx, { action: "using the assistant" })
  if (!user) return

  const result = await clearDiscordChat({ discordUserId, channelId })

  if (!result.success) {
    logger.error("Assistant reset failed", undefined, {
      discordUserId,
      channelId,
      error: result.error,
    })
    await interaction.reply({
      content:
        "Sorry, I couldn't clear the chat context right now. Please try again in a moment.",
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.reply({
    content: "✅ Chat context cleared! Starting fresh.",
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Dispatch to the `ask` / `reset` subcommand handler.
 * @internal
 */
async function handleAssistant(ctx: InteractionContext): Promise<void> {
  const subcommand = ctx.interaction.options.getSubcommand()
  if (subcommand === "reset") {
    await handleReset(ctx)
    return
  }
  await handleAsk(ctx)
}

/**
 * The `/assistant` slash command: `ask` (one-shot question) and `reset` (clear
 * context) subcommands.
 */
export const assistantCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("assistant")
    .setDescription("Ask the AI assistant a question")
    .addSubcommand((sub) =>
      sub
        .setName("ask")
        .setDescription("Ask the assistant a question (answer is only visible to you)")
        .addStringOption((option) =>
          option
            .setName("prompt")
            .setDescription("What would you like to ask?")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("reset").setDescription("Clear your assistant conversation context")
    ) as SlashCommandBuilder,
  commandType: "CHAT" as DiscordCommandType,
  handle: handleAssistant,
}
