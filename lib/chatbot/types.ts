// Client-facing message type
export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  sources?: Array<{
    tool: string
    description: string
  }>
}

export interface ChatResponse {
  success: boolean
  message?: ChatMessage
  error?: string
  conversationId?: string
  /** A daily spend cap stopped the turn before an LLM call; `error` is the copy to show. */
  refusal?: "BUDGET_EXCEEDED" | "BUDGET_UNAVAILABLE"
}

/** One conversation in the assistant page's history (`lib/data/assistant-history.ts`). */
export interface AssistantHistoryItem {
  id: string
  title: string
  /** Epoch milliseconds. */
  lastMessageAt: number
}

/** A conversation the assistant page opens, with its newest stored messages. */
export interface AssistantConversation {
  id: string
  title: string
  messages: ChatMessage[]
}
