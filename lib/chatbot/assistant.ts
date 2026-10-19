import { runConversationLoop } from "@/actions/chatbot/conversation"
import {
  ALL_TOOLS,
  DISCORD_SAFE_TOOLS,
  generateDiscordSystemPrompt,
  generateSystemPrompt,
} from "@/actions/chatbot/tools"
import { type ChatMessage, type ChatResponse } from "@/actions/chatbot/types"
import { type ChatTool } from "@/lib/llm/chat"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CHATBOT_ASSISTANT")

type ChatbotContext = "default" | "discord"

/** Discord replies are short and must fit in a few 2,000-character messages (SEC-51). */
const DISCORD_MAX_OUTPUT_TOKENS = 600

interface RunChatbotOptions {
  userId: string
  messages: ChatMessage[]
  conversationId?: string
  context?: ChatbotContext
  /**
   * Whether the acting user is an app admin. Threaded through to the executor's
   * Discord admin-tier guard (Step 19, FR-14). The admin web path leaves this
   * undefined (the default context has no tier restriction); the Discord path
   * sets it from the linked user's `isAdmin` so a non-admin member cannot invoke
   * server-wide admin-only tools.
   */
  isAdmin?: boolean
}

function getToolsForContext(context: ChatbotContext | undefined): ChatTool[] {
  return context === "discord" ? DISCORD_SAFE_TOOLS : ALL_TOOLS
}

function getSystemPrompt(context: ChatbotContext | undefined, toolset: ChatTool[]) {
  if (context === "discord") {
    return generateDiscordSystemPrompt(toolset)
  }

  return generateSystemPrompt(toolset)
}

export async function runChatbotForUser(options: RunChatbotOptions): Promise<ChatResponse> {
  try {
    const lastMessage = options.messages[options.messages.length - 1]
    if (!lastMessage || lastMessage.role !== "user") {
      return { success: false, error: "Invalid message history" }
    }

    const [config, llmProvider] = await Promise.all([
      prisma.config.findUnique({
        where: { id: "config" },
        select: { llmDisabled: true },
      }),
      prisma.lLMProvider.findFirst({
        where: { isActive: true, purpose: "chat" },
        select: { id: true },
      }),
    ])

    // Any provider row works: the registry builds the model, and a row it cannot build is reported by the loop
    if (config?.llmDisabled || !llmProvider) {
      return {
        success: true,
        message: {
          role: "assistant",
          content:
            "AI features are currently disabled or not configured. Please configure a chat model in Settings to use the troubleshooting assistant.",
          timestamp: Date.now(),
        },
      }
    }

    let activeConversationId = options.conversationId
    if (!activeConversationId) {
      const conversation = await prisma.chatConversation.create({
        data: { userId: options.userId },
      })
      activeConversationId = conversation.id
    }

    const toolset = getToolsForContext(options.context)
    const systemPrompt = getSystemPrompt(options.context, toolset)

    const result = await runConversationLoop(options.messages, {
      userId: options.userId,
      conversationId: activeConversationId,
      context: options.context,
      isAdmin: options.isAdmin,
      systemPrompt,
      tools: toolset,
      maxOutputTokens: options.context === "discord" ? DISCORD_MAX_OUTPUT_TOKENS : undefined,
    })

    return {
      ...result,
      conversationId: activeConversationId,
    }
  } catch (error) {
    logger.error("Failed to run chatbot", error instanceof Error ? error : undefined, {
      userId: options.userId,
    })
    return {
      success: false,
      error: "Failed to process message",
    }
  }
}
