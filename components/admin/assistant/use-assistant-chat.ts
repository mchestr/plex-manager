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
  /**
   * The server's render of the conversation the transcript last followed:
   * each server render brings a new object, while a re-render of the page
   * keeps it, so a fresh render of the same URL still reopens it after a
   * reset. It sits in the same state as the transcript, so a switch moves
   * both or neither, however React rebases the updates.
   */
  shown: AssistantConversation | null
  /** How many times another conversation, stored or new, took the transcript, so the page can move focus to it. */
  opens: number
}

const UNREACHABLE = "Could not connect to the assistant. Try again."

/** The transcript of `conversation`, or of a new one; after `prev`, it counts as another conversation taking over. */
function opened(conversation: AssistantConversation | null, prev?: ChatState): ChatState {
  return {
    id: conversation?.id ?? null,
    messages: conversation?.messages ?? [],
    pending: false,
    error: null,
    session: prev ? prev.session + 1 : 0,
    shown: conversation,
    opens: prev ? prev.opens + 1 : 0,
  }
}

/** An update for the transcript a send started in: once another conversation has replaced it, the update does nothing. */
function inSession(sentIn: number, update: (prev: ChatState) => ChatState) {
  return (prev: ChatState) => (prev.session === sentIn ? update(prev) : prev)
}

/**
 * The assistant page's transcript: the open conversation's stored messages,
 * the turn in flight and the last error. The page stays mounted from one
 * conversation's URL to the next, so the transcript is replaced here when the
 * server sends another conversation or `reset` starts a new one, and a new
 * conversation's URL follows its id once the first reply gives it one.
 */
export function useAssistantChat(conversation: AssistantConversation | null) {
  const router = useRouter()
  const serverId = conversation?.id ?? null
  const [state, setState] = useState(() => opened(conversation))
  const session = useRef(state.session)

  if (conversation !== state.shown) {
    // The URL catching up with a new conversation's id, or a refresh of the open one, is still this transcript
    setState(serverId === state.id ? { ...state, shown: conversation } : opened(conversation, state))
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

  /**
   * Empties the transcript for a new conversation at once, dropping any reply
   * still on its way: for "New conversation", and for the open conversation's
   * delete. It keeps following the server's current render, so only a fresh
   * one reopens a conversation: going back to this one before the new page
   * arrives finds it whole.
   */
  const reset = useCallback(() => setState((prev) => ({ ...opened(null, prev), shown: prev.shown })), [])

  /**
   * Drops a new conversation's first reply still on its way as a link leaves
   * for another conversation: landing meanwhile, it would move the URL to its
   * own conversation and override the navigation. A stored conversation's
   * reply lands in its own transcript, so it stays, and with nothing to drop
   * the transcript (and its scroll position) is left alone.
   */
  const leave = useCallback(() => {
    if (state.id === null && state.pending) setState((prev) => ({ ...prev, pending: false, session: prev.session + 1 }))
  }, [state.id, state.pending])

  return { ...state, send, reset, leave }
}
