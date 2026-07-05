import { type ChatMessage } from "@/actions/chatbot/types"
import { isAccessAllowed } from "@/lib/access"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { appendTurn, getOrCreateSession } from "@/lib/discord/chat-session"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DISCORD_SERVICES")

export interface VerifyDiscordUserResult {
  linked: boolean
  /**
   * Whether the linked user is an *entitled member* — allowed to invoke bot
   * commands. Follows the app's canonical rule (see `lib/access.ts`): when Stripe
   * gating is disabled this is `true` for any linked user (today's behavior);
   * when enabled it requires admin, exempt, or an ACTIVE/PAST_DUE subscription.
   * `false` when not linked or not entitled.
   */
  entitled: boolean
  user?: {
    id: string
    name: string | null
    email: string | null
    plexUserId: string | null
    isAdmin: boolean
  }
  metadataSyncedAt?: Date | null
  linkedAt?: Date
}

export interface DiscordChatResult {
  success: boolean
  linked: boolean
  /** `false` when the linked user is not an entitled member (see verifyDiscordUser). */
  entitled?: boolean
  message?: ChatMessage
  conversationId?: string
  error?: string
}

export interface ClearChatResult {
  success: boolean
  linked: boolean
  conversationId?: string
  error?: string
}

/**
 * Verify if a Discord user is linked to a Plex Wrapped account
 * Direct function call - no HTTP overhead
 */
export async function verifyDiscordUser(discordUserId: string): Promise<VerifyDiscordUserResult> {
  const [connection, config] = await Promise.all([
    prisma.discordConnection.findUnique({
      where: { discordUserId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            plexUserId: true,
            isAdmin: true,
            isExempt: true,
            subscription: { select: { status: true } },
          },
        },
      },
    }),
    prisma.config.findUnique({
      where: { id: "config" },
      select: { stripeEnabled: true },
    }),
  ])

  if (!connection || connection.revokedAt) {
    return { linked: false, entitled: false }
  }

  const entitled = isAccessAllowed({
    stripeEnabled: config?.stripeEnabled ?? false,
    isAdmin: connection.user.isAdmin,
    isExempt: connection.user.isExempt,
    subscriptionStatus: connection.user.subscription?.status ?? null,
  })

  return {
    linked: true,
    entitled,
    user: {
      id: connection.userId,
      name: connection.user.name,
      email: connection.user.email,
      plexUserId: connection.user.plexUserId,
      isAdmin: connection.user.isAdmin,
    },
    metadataSyncedAt: connection.metadataSyncedAt,
    linkedAt: connection.linkedAt,
  }
}

/**
 * Handle a Discord chatbot message.
 *
 * Orchestration only: session resolution and history persistence are delegated
 * to `chat-session` (which makes both concurrency-safe), and history coercion to
 * `chat-history`. This function owns the LLM call and response sanitization.
 *
 * Direct function call - no HTTP overhead.
 */
export async function handleDiscordChat({
  discordUserId,
  channelId,
  message,
}: {
  discordUserId: string
  channelId: string
  message: string
}): Promise<DiscordChatResult> {
  const [connection, config] = await Promise.all([
    prisma.discordConnection.findUnique({
      where: { discordUserId },
      include: {
        user: {
          select: {
            id: true,
            isAdmin: true,
            isExempt: true,
            subscription: { select: { status: true } },
          },
        },
      },
    }),
    prisma.config.findUnique({
      where: { id: "config" },
      select: { stripeEnabled: true },
    }),
  ])

  if (!connection || connection.revokedAt) {
    return { success: false, linked: false, entitled: false, error: "Discord account is not linked" }
  }

  // Entitlement gate (data-disclosure safety): a linked but non-subscribed user
  // must not reach the assistant / its tools. The router surfaces the nudge; this
  // is the authoritative chokepoint where tool data would otherwise be accessed.
  const entitled = isAccessAllowed({
    stripeEnabled: config?.stripeEnabled ?? false,
    isAdmin: connection.user.isAdmin,
    isExempt: connection.user.isExempt,
    subscriptionStatus: connection.user.subscription?.status ?? null,
  })
  if (!entitled) {
    return { success: false, linked: true, entitled: false, error: "Subscription required" }
  }

  const session = await getOrCreateSession({
    discordUserId,
    channelId,
    userId: connection.userId,
  })

  const now = Date.now()
  const userMessage: ChatMessage = {
    role: "user",
    content: message,
    timestamp: now,
  }

  const conversationMessages = [...session.history, userMessage]

  const chatbotResponse = await runChatbotForUser({
    userId: connection.userId,
    messages: conversationMessages,
    conversationId: session.chatConversationId,
    context: "discord",
    // Thread the linked user's admin status so the executor's Discord admin-tier
    // guard can gate server-wide tools (Step 19, FR-14).
    isAdmin: connection.user.isAdmin,
  })

  if (!chatbotResponse.success || !chatbotResponse.message) {
    logger.error("Failed to process Discord chatbot request", undefined, {
      discordUserId,
      channelId,
      error: chatbotResponse.error,
    })
    return {
      success: false,
      linked: true,
      error: chatbotResponse.error ?? "Failed to process chatbot request",
    }
  }

  const sanitized = sanitizeDiscordResponse(chatbotResponse.message.content)
  const baseContent =
    sanitized.content.trim().length > 0
      ? sanitized.content
      : "Here's what I can help with: system status, queue issues, and download problems for Plex, Tautulli, Overseerr, Sonarr, or Radarr."

  const safeContent = sanitized.redacted
    ? `${baseContent}\n\n_(Personal details were removed for privacy.)_`
    : baseContent

  const safeMessage: ChatMessage = {
    ...chatbotResponse.message,
    content: safeContent,
  }

  const conversationId = chatbotResponse.conversationId ?? session.chatConversationId

  await appendTurn({
    sessionId: session.id,
    userMessage,
    assistantMessage: safeMessage,
    chatConversationId: conversationId,
  })

  logger.info("Discord chatbot response delivered", {
    discordUserId,
    channelId,
    conversationId,
  })

  return {
    success: true,
    linked: true,
    message: safeMessage,
    conversationId,
  }
}

/**
 * Clear Discord chat context for a user/channel.
 * Direct function call - no HTTP overhead.
 *
 * INVARIANT: this only clears the caller's own conversation and discloses no
 * server data, so it does NOT perform an entitlement check itself — it relies on
 * callers to gate first (the `/assistant reset` subcommand via `requireLinkedUser`
 * and the DM `reset`/`clear` keyword via the DM router's entitlement check). Any
 * new caller must gate entitlement before invoking this.
 */
export async function clearDiscordChat({
  discordUserId,
  channelId,
}: {
  discordUserId: string
  channelId: string
}): Promise<ClearChatResult> {
  const connection = await prisma.discordConnection.findUnique({
    where: { discordUserId },
  })

  if (!connection || connection.revokedAt) {
    return { success: false, linked: false, error: "Discord account is not linked" }
  }

  const sessionKey = {
    discordUserId,
    discordChannelId: channelId,
  }

  const session = await prisma.discordChatSession.findUnique({
    where: {
      discordUserId_discordChannelId: sessionKey,
    },
  })

  if (!session) {
    // No session to clear, return success anyway
    logger.info("No session found to clear", {
      discordUserId,
      channelId,
    })
    return {
      success: true,
      linked: true,
    }
  }

  // Create a new conversation and clear the messages
  const conversation = await prisma.chatConversation.create({
    data: { userId: connection.userId },
  })

  await prisma.discordChatSession.update({
    where: { id: session.id },
    data: {
      chatConversationId: conversation.id,
      messages: [],
      isActive: true,
      lastMessageAt: new Date(),
    },
  })

  logger.info("Discord chat session cleared", {
    discordUserId,
    channelId,
    oldConversationId: session.chatConversationId,
    newConversationId: conversation.id,
  })

  return {
    success: true,
    linked: true,
    conversationId: conversation.id,
  }
}
