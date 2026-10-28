"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

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

/** An update for the transcript a send started in: once another conversation has replaced it, the update does nothing. */
function inSession(sentIn: number, update: (prev: ChatState) => ChatState) {
  return (prev: ChatState) => (prev.session === sentIn ? update(prev) : prev)
}

/**
 * The assistant page's transcript: the open conversation's stored messages,
 * the turn in flight and the last error. The page stays mounted from one
 * conversation's URL to the next, so the transcript is replaced here when the
 * server sends another conversation or "New conversation" calls `reset`, and a
 * new conversation's URL follows its id once the first reply gives it one.
 */
export function useAssistantChat(conversation: AssistantConversation | null) {
  const router = useRouter()
  const serverId = conversation?.id ?? null
  const [state, setState] = useState(() => opened(conversation, 0))
  const [shownId, setShownId] = useState(serverId)
  // How many times another conversation, stored or new, took the transcript, so the page can move focus to it
  const [opens, setOpens] = useState(0)
  const session = useRef(state.session)

  if (serverId !== shownId) {
    setShownId(serverId)
    // The URL catching up with a new conversation's id is still this transcript
    if (serverId !== state.id) {
      setState(opened(conversation, state.session + 1))
      setOpens(opens + 1)
    }
  }

  // A real effect: a reply checks it to tell whether its conversation is still open. In the
  // commit that replaces the transcript, since a navigation's passive effects can run after a reply lands
  useLayoutEffect(() => {
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
      setState(inSession(sentIn, (prev) => ({ ...prev, pending: true, error: null, messages: [...prev.messages, question] })))

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
        setState(inSession(sentIn, (prev) => ({ ...prev, pending: false, id: conversationId ?? prev.id, messages: [...prev.messages, message] })))
        return "sent"
      }
      // A refused question leaves the transcript, so it shows only what is stored
      const error = result ? result.error : UNREACHABLE
      setState(inSession(sentIn, (prev) => ({ ...prev, pending: false, error, messages: prev.messages.filter((m) => m !== question) })))
      return "failed"
    },
    [state.id, state.pending, state.session]
  )

  /** Empties the transcript for a new conversation before its URL has loaded, dropping any reply still on its way. */
  const reset = useCallback(() => {
    setState((prev) => opened(null, prev.session + 1))
    setOpens((count) => count + 1)
  }, [])

  /**
   * Drops any reply still on its way as a link leaves for another
   * conversation, keeping the transcript until that one loads: a first reply
   * landing meanwhile would otherwise move the URL to its own conversation,
   * overriding the navigation.
   */
  const leave = useCallback(() => setState((prev) => ({ ...prev, pending: false, session: prev.session + 1 })), [])

  return { ...state, opens, send, reset, leave }
}
