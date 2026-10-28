"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { chatWithAdminBot } from "@/actions/chatbot"
import { assistant } from "@/lib/admin/routes"
import type { AssistantConversation, ChatMessage } from "@/lib/chatbot/types"
import { browserTimeZone } from "@/lib/utils/browser-zone"

/** A send was stored, refused (its text goes back to the composer), or dropped because another conversation opened. */
export type SendOutcome = "sent" | "failed" | "dropped"

interface ChatState {
  /** The conversation the transcript belongs to: null until a new one's first reply. */
  id: string | null
  messages: ChatMessage[]
  pending: boolean
  error: string | null
  /** A new number each time another conversation replaces the transcript, so a late reply is dropped. */
  session: number
}

const UNREACHABLE = "The assistant could not be reached. Try again."

function opened(conversation: AssistantConversation | null, session: number): ChatState {
  return { id: conversation?.id ?? null, messages: conversation?.messages ?? [], pending: false, error: null, session }
}

/**
 * The assistant page's transcript: the open conversation's stored messages,
 * the turn in flight and the last error. The page stays mounted from one
 * conversation's URL to the next, so the transcript is replaced here when the
 * server sends another conversation, and a new conversation's URL follows its
 * id once the first reply gives it one.
 */
export function useAssistantChat(conversation: AssistantConversation | null) {
  const router = useRouter()
  const serverId = conversation?.id ?? null
  const [state, setState] = useState(() => opened(conversation, 0))
  const [shownId, setShownId] = useState(serverId)
  const session = useRef(state.session)

  if (serverId !== shownId) {
    setShownId(serverId)
    // The URL catching up with a new conversation's id is still this transcript
    if (serverId !== state.id) setState(opened(conversation, state.session + 1))
  }

  // A real effect: an async reply checks it to tell whether its conversation is still open
  useEffect(() => {
    session.current = state.session
  }, [state.session])

  // A real effect: once a new conversation has an id, the URL follows it
  useEffect(() => {
    if (state.id !== null && state.id !== serverId) router.replace(assistant(state.id), { scroll: false })
  }, [router, serverId, state.id])

  const send = useCallback(
    async (text: string): Promise<SendOutcome> => {
      const content = text.trim()
      if (!content || state.pending) return "dropped"
      const sentIn = state.session
      const question: ChatMessage = { role: "user", content, timestamp: Date.now() }
      setState((prev) => ({ ...prev, pending: true, error: null, messages: [...prev.messages, question] }))

      let result: Awaited<ReturnType<typeof chatWithAdminBot>> | null = null
      try {
        // The assistant gives its times in the viewer's own zone
        result = await chatWithAdminBot({ message: content, conversationId: state.id ?? undefined, timeZone: browserTimeZone() ?? undefined })
      } catch {
        // The request never reached the server, or its answer never arrived
      }
      if (session.current !== sentIn) return "dropped"

      if (result?.success) {
        const { message, conversationId } = result.data
        setState((prev) => ({ ...prev, pending: false, id: conversationId ?? prev.id, messages: [...prev.messages, message] }))
        return "sent"
      }
      // A refused question leaves the transcript, so it shows only what is stored
      const error = result ? result.error : UNREACHABLE
      setState((prev) => ({ ...prev, pending: false, error, messages: prev.messages.filter((m) => m !== question) }))
      return "failed"
    },
    [state.id, state.pending, state.session]
  )

  return { id: state.id, messages: state.messages, pending: state.pending, error: state.error, session: state.session, send }
}
