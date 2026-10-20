"use client"

import { useCallback, useState } from "react"

import { chatWithAdminBot } from "@/actions/chatbot"
import { type ChatMessage } from "@/actions/chatbot/types"

/** The newest turns that fit the action's bounds: 40 messages and 60,000 characters (SEC-42). */
function boundedHistory(messages: ChatMessage[]) {
  const history: { role: "user" | "assistant"; content: string }[] = []
  let total = 0
  for (const { role, content } of [...messages].reverse()) {
    if (role === "system") continue
    if (history.length === 40 || total + content.length > 60_000) break
    total += content.length
    history.unshift({ role, content })
  }
  return history
}

const greeting = (userName?: string): ChatMessage => ({
  role: "assistant",
  content: `Hi${userName ? " " + userName : ""}! I'm your admin assistant. I can help you troubleshoot issues with Plex, Tautulli, Overseerr, Sonarr, and Radarr. What can I do for you?`,
  timestamp: Date.now(),
})

const reply = (content: string): ChatMessage => ({ role: "assistant", content, timestamp: Date.now() })

/**
 * The assistant's conversation: the transcript, whether a reply is pending,
 * `send` and `reset`. It lives in the always-mounted sheet, so closing the
 * sheet keeps the conversation.
 */
export function useAssistantChat(userName?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [greeting(userName)])
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || isLoading) return
      const userMessage: ChatMessage = { role: "user", content, timestamp: Date.now() }
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      try {
        const response = await chatWithAdminBot({
          messages: boundedHistory([...messages, userMessage]),
          conversationId,
        })
        if (response.success) {
          if (response.data.conversationId) setConversationId(response.data.conversationId)
          setMessages((prev) => [...prev, response.data.message])
        } else {
          setMessages((prev) => [...prev, reply(`Sorry, I couldn't answer that. ${response.error}`)])
        }
      } catch {
        setMessages((prev) => [...prev, reply("Sorry, something went wrong. Please try again later.")])
      } finally {
        setIsLoading(false)
      }
    },
    [conversationId, isLoading, messages]
  )

  const reset = useCallback(() => {
    setMessages([greeting(userName)])
    setConversationId(undefined)
  }, [userName])

  return { messages, isLoading, send, reset }
}
