import { type ChatMessage } from "@/actions/chatbot/types"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { Prisma } from "@prisma/client"

const logger = createLogger("DISCORD_SERVICES")
const HISTORY_LIMIT = 12
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

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

function coerceHistory(value: Prisma.JsonValue | null | undefined): ChatMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: ChatMessage[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const record = entry as Record<string, unknown>
    if (record.role !== "user" && record.role !== "assistant") {
      continue
    }
    if (typeof record.content !== "string") {
      continue
    }
    result.push({
      role: record.role,
      content: record.content,
      timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
      sources: Array.isArray(record.sources)
        ? (record.sources as Array<{ tool: string; description: string }>)
        : undefined,
    })
  }
  return result
}

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= HISTORY_LIMIT) {
    return messages
  }

  return messages.slice(messages.length - HISTORY_LIMIT)
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
 * Handle a Discord chatbot message
 * Direct function call - no HTTP overhead
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

  const now = Date.now()
  const sessionKey = {
    discordUserId,
    discordChannelId: channelId,
  }

  let session = await prisma.discordChatSession.findUnique({
    where: {
      discordUserId_discordChannelId: sessionKey,
    },
  })

  const sessionExpired =
    !session ||
    !session.isActive ||
    Math.abs(now - session.lastMessageAt.getTime()) > SESSION_IDLE_TIMEOUT_MS

  if (sessionExpired) {
    const conversation = await prisma.chatConversation.create({
      data: { userId: connection.userId },
    })

    session = await prisma.discordChatSession.upsert({
      where: {
        discordUserId_discordChannelId: sessionKey,
      },
      update: {
        chatConversationId: conversation.id,
        messages: [],
        isActive: true,
        lastMessageAt: new Date(now),
      },
      create: {
        discordUserId,
        discordChannelId: channelId,
        chatConversationId: conversation.id,
        messages: [],
      },
    })
  }

  if (!session) {
    logger.error("Failed to initialize Discord chat session", undefined, {
      discordUserId,
      channelId,
    })
    return { success: false, linked: true, error: "Unable to initialize chat session" }
  }

  const history = trimHistory(coerceHistory(session?.messages))
  const userMessage: ChatMessage = {
    role: "user",
    content: message,
    timestamp: now,
  }

  const conversationMessages = [...history, userMessage]

  const chatbotResponse = await runChatbotForUser({
    userId: connection.userId,
    messages: conversationMessages,
    conversationId: session?.chatConversationId,
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

  const updatedHistory = trimHistory([...history, userMessage, safeMessage])

  await prisma.discordChatSession.update({
    where: { id: session.id },
    data: {
      messages: updatedHistory as unknown as Prisma.JsonArray,
      lastMessageAt: new Date(),
      isActive: true,
      chatConversationId: chatbotResponse.conversationId ?? session.chatConversationId,
    },
  })

  logger.info("Discord chatbot response delivered", {
    discordUserId,
    channelId,
    conversationId: chatbotResponse.conversationId ?? session?.chatConversationId,
  })

  return {
    success: true,
    linked: true,
    message: safeMessage,
    conversationId: chatbotResponse.conversationId ?? session?.chatConversationId,
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

