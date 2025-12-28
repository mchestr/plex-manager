"use server"

import { authOptions } from "@/lib/auth"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { createLogger } from "@/lib/utils/logger"
import { getServerSession } from "next-auth"

import { type ChatMessage, type ChatResponse } from "./types"

const logger = createLogger("CHATBOT")

export async function chatWithAdminBot(
  messages: ChatMessage[],
  conversationId?: string
): Promise<ChatResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" }
    }
    const userId = session.user.id

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "user") {
      return { success: false, error: "Invalid message history" }
    }

    const result = await runChatbotForUser({
      userId,
      messages,
      conversationId,
    })
    return result
  } catch (error) {
    logger.error("Chatbot error", error)
    return {
      success: false,
      error: "Failed to process message",
    }
  }
}


