import { runConversationLoop } from "@/actions/chatbot/conversation"
import {
  DISCORD_SAFE_TOOLS,
  generateDiscordSystemPrompt,
  generateSystemPrompt,
  TOOLS,
} from "@/actions/chatbot/tools"
import { type ChatMessage, type ChatResponse } from "@/actions/chatbot/types"
import { type ChatTool } from "@/lib/llm/chat"
import { prisma } from "@/lib/prisma"
import { getActiveLLMProvider } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CHATBOT_ASSISTANT")

export type ChatbotContext = "default" | "discord"

interface RunChatbotOptions {
  userId: string
  messages: ChatMessage[]
  conversationId?: string
  context?: ChatbotContext
}

function getToolsForContext(context: ChatbotContext | undefined): ChatTool[] {
  return context === "discord" ? DISCORD_SAFE_TOOLS : TOOLS
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

    const [config, llmProviderService] = await Promise.all([
      prisma.config.findUnique({
        where: { id: "config" },
        select: { llmDisabled: true },
      }),
      getActiveLLMProvider("chat"),
    ])

    const llmDisabled = config?.llmDisabled ?? false
    const llmConfig = llmProviderService?.config
    const useLLM = !llmDisabled && !!llmConfig && llmConfig.provider === "openai" && !!llmConfig.model

    if (!useLLM || !llmConfig?.model) {
      return {
        success: true,
        message: {
          role: "assistant",
          content:
            "AI features are currently disabled or not configured. Please configure a chat OpenAI model in Settings to use the troubleshooting assistant.",
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
      llmProvider: {
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        temperature: llmConfig.temperature ?? null,
        maxTokens: llmConfig.maxTokens ?? null,
      },
      systemPrompt,
      tools: toolset,
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


