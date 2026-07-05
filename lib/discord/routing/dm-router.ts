/**
 * Direct-message router for the DM-based AI assistant (Step 13).
 *
 * ## Overview
 *
 * Handles `messageCreate` events that arrive in a **DM channel**. This is the
 * assistant surface after the `MessageContent` privileged intent is dropped
 * (Step 14): Discord delivers full message content for DMs even without that
 * intent, so a user can hold a multi-turn conversation with the bot simply by
 * DMing it. The complementary `/assistant` slash command (see
 * `commands/assistant.ts`) can be invoked in a guild and points the user here
 * for the ongoing conversation.
 *
 * ## Flow
 *
 * ```
 * DM messageCreate
 *   │
 *   ├─ bot's own message ──────► ignored
 *   ├─ not a DM channel ───────► ignored
 *   ├─ author not linked ──────► reply with the account-link nudge
 *   ├─ content is reset/clear ─► clearDiscordChat → confirm
 *   ├─ content is empty ───────► reply asking for a message
 *   └─ otherwise ──────────────► handleDiscordChat (context "discord") → reply
 *                                 (wrapped in withAuditLog, commandType CHAT)
 * ```
 *
 * ## Dependency injection
 *
 * `verifyDiscordUser`, `handleDiscordChat`, and `clearDiscordChat` are injected
 * via {@link DmRouteDeps} so the router is unit-testable without a live gateway
 * client or database. Defaults wire up the real implementations.
 */

import { ChannelType, type Message } from "discord.js"
import {
  clearDiscordChat as defaultClearDiscordChat,
  handleDiscordChat as defaultHandleDiscordChat,
  verifyDiscordUser as defaultVerifyDiscordUser,
} from "../services"
import { withAuditLog } from "./audit-wrapper"
import type { CreateCommandLogParams } from "../audit"
import type { DiscordCommandType } from "@/lib/generated/prisma"

/** DM keywords that reset the conversation (case-insensitive, trimmed). */
const RESET_KEYWORDS = ["reset", "clear"]

/**
 * Injectable collaborators for {@link routeDirectMessage}.
 */
export interface DmRouteDeps {
  verifyDiscordUser: typeof defaultVerifyDiscordUser
  handleDiscordChat: typeof defaultHandleDiscordChat
  clearDiscordChat: typeof defaultClearDiscordChat
  /** URL the account-link nudge points unlinked users at. */
  portalUrl: string
}

function defaultDeps(portalUrl: string): DmRouteDeps {
  return {
    verifyDiscordUser: defaultVerifyDiscordUser,
    handleDiscordChat: defaultHandleDiscordChat,
    clearDiscordChat: defaultClearDiscordChat,
    portalUrl,
  }
}

/** Build the "please link your account" nudge for an unlinked DM author. */
function buildLinkNudge(discordUserId: string, portalUrl: string): {
  content: string
  allowedMentions: { users: string[] }
} {
  return {
    content: `Hi <@${discordUserId}>! To talk with the assistant, please link your account first: ${portalUrl}`,
    allowedMentions: { users: [discordUserId] },
  }
}

/**
 * Route a single direct-message `messageCreate` event to the assistant.
 *
 * @param message - The message from the `MessageCreate` event.
 * @param deps - Injectable collaborators; defaults to the real implementations
 *   with the given portal URL.
 */
export async function routeDirectMessage(
  message: Message,
  deps: DmRouteDeps
): Promise<void> {
  // Ignore the bot's own messages and anything that is not a DM.
  if (message.author.bot) return
  const isDm = message.channel.type === ChannelType.DM || !message.guildId
  if (!isDm) return

  const discordUserId = message.author.id
  const channelId = message.channelId

  const verification = await deps.verifyDiscordUser(discordUserId)
  if (!verification.linked) {
    await message.reply(buildLinkNudge(discordUserId, deps.portalUrl))
    return
  }

  const auditBase = {
    discordUserId,
    discordUsername: message.author.tag,
    userId: verification.user?.id,
    channelId,
    channelType: "dm",
  } satisfies Omit<CreateCommandLogParams, "commandType" | "commandName">

  const trimmed = (message.content ?? "").trim()
  const normalized = trimmed.toLowerCase()

  // Reset / clear keyword → clear the conversation context.
  if (RESET_KEYWORDS.includes(normalized)) {
    await withAuditLog(
      {
        ...auditBase,
        commandType: "CLEAR_CONTEXT" as DiscordCommandType,
        commandName: normalized,
      },
      async () => {
        const result = await deps.clearDiscordChat({ discordUserId, channelId })
        if (!result.success) {
          throw new Error(result.error || "Failed to clear chat context")
        }
        await message.reply({
          content: "✅ Chat context cleared! Starting fresh.",
          allowedMentions: { users: [discordUserId] },
        })
      }
    ).catch(async () => {
      await message.reply({
        content:
          "Sorry, I couldn't clear the chat context right now. Please try again in a moment.",
        allowedMentions: { users: [discordUserId] },
      })
    })
    return
  }

  // Nothing actionable to send to the assistant.
  if (!trimmed) {
    await message.reply({
      content: "I didn't catch a question. Please include a message so I can help.",
      allowedMentions: { users: [discordUserId] },
    })
    return
  }

  // Normal message → run the assistant.
  await withAuditLog(
    {
      ...auditBase,
      commandType: "CHAT" as DiscordCommandType,
      commandName: "dm",
      commandArgs: trimmed.substring(0, 500),
    },
    async () => {
      if (message.channel.isSendable()) {
        await message.channel.sendTyping().catch(() => {})
      }
      const response = await deps.handleDiscordChat({
        discordUserId,
        channelId,
        message: trimmed,
      })

      if (response.linked === false) {
        await message.reply(buildLinkNudge(discordUserId, deps.portalUrl))
        return
      }

      if (!response.success || !response.message?.content) {
        throw new Error(response.error || "Empty assistant response")
      }

      await message.reply({
        content: response.message.content,
        allowedMentions: { users: [discordUserId] },
      })
    }
  ).catch(async () => {
    await message.reply({
      content:
        "Sorry, I couldn't reach the assistant right now. Please try again in a moment.",
      allowedMentions: { users: [discordUserId] },
    })
  })
}

export { defaultDeps as defaultDmRouteDeps }
