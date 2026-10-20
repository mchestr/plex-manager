"use client"

import type { ReactNode } from "react"

import { usePick } from "@/components/rewind/stage/quiz-context"

/**
 * Top shows' deck (design 4.3): after the quiz was answered, the callback
 * that names the guess; otherwise the page's own deck. Both are typeset on
 * the server; only the choice happens here, since the answer never leaves
 * the browser.
 */
export function QuizDeck({ deck, callbacks }: { deck: ReactNode; callbacks: Readonly<Record<string, ReactNode>> }) {
  const pick = usePick()
  return (pick && callbacks[pick.key]) ?? deck
}
