import { type ChatMessage } from "@/actions/chatbot/types"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { sanitizeDiscordResponse } from "@/lib/discord/chat-safety"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

const logger = createLogger("DISCORD_CHAT_ROUTE")
const HISTORY_LIMIT = 12
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

interface DiscordChatPayload {
  discordUserId?: string
  channelId?: string
  message?: string
  messageId?: string
  channelType?: string
}

function extractSecret(request: Request): string | null {
  const headerKey = request.headers.get("x-plexwrapped-bot-key")
  if (headerKey) return headerKey

  const authHeader = request.headers.get("authorization")
  if (!authHeader) return null

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim()
  }

  return authHeader.trim()
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

export async function POST(request: Request) {
  const integration = await prisma.discordIntegration.findUnique({ where: { id: "discord" } })
  if (!integration?.botSharedSecret) {
    return NextResponse.json({ error: "Bot chat is not configured" }, { status: 503 })
  }

  const providedSecret = extractSecret(request)
  if (!providedSecret || providedSecret !== integration.botSharedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: DiscordChatPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const discordUserId = payload.discordUserId?.trim()
  const channelId = payload.channelId?.trim()
  const content = payload.message?.trim()

  if (!discordUserId || !channelId) {
    return NextResponse.json({ error: "discordUserId and channelId are required" }, { status: 400 })
  }

  if (!content) {
    return NextResponse.json({ error: "message is required" }, { status: 400 })
  }

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
    return NextResponse.json({ linked: false, error: "Discord account is not linked" }, { status: 403 })
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
    logger.error("Failed to initialize Discord chat session", {
      discordUserId,
      channelId,
    })
    return NextResponse.json({ error: "Unable to initialize chat session" }, { status: 500 })
  }

  const history = trimHistory(coerceHistory(session?.messages))
  const userMessage: ChatMessage = {
    role: "user",
    content,
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
    return NextResponse.json(
      {
        success: false,
        error: chatbotResponse.error ?? "Failed to process chatbot request",
      },
      { status: 500 }
    )
  }

  const sanitized = sanitizeDiscordResponse(chatbotResponse.message.content)
  const baseContent =
    sanitized.content.trim().length > 0
      ? sanitized.content
      : "Here’s what I can help with: system status, queue issues, and download problems for Plex, Tautulli, Overseerr, Sonarr, or Radarr."

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
    channelType: payload.channelType ?? "unknown",
  })

  return NextResponse.json({
    success: true,
    linked: true,
    message: safeMessage,
    conversationId: chatbotResponse.conversationId ?? session?.chatConversationId,
  })
}


