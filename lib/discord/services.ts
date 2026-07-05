import { type ChatMessage } from "@/actions/chatbot/types"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { appendTurn, getOrCreateSession } from "@/lib/discord/chat-session"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DISCORD_SERVICES")

export interface VerifyDiscordUserResult {
  linked: boolean
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
  const connection = await prisma.discordConnection.findUnique({
    where: { discordUserId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          plexUserId: true,
          isAdmin: true,
        },
      },
    },
  })

  if (!connection || connection.revokedAt) {
    return { linked: false }
  }

  return {
    linked: true,
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
  const connection = await prisma.discordConnection.findUnique({
    where: { discordUserId },
    include: {
      user: {
        select: {
          id: true,
        },
      },
    },
  })

  if (!connection || connection.revokedAt) {
    return { success: false, linked: false, error: "Discord account is not linked" }
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
 * Clear Discord chat context for a user/channel
 * Direct function call - no HTTP overhead
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
