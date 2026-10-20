"use client"

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react"
import { z } from "zod"

/**
 * The quiz answer (Rewind design 4.3, page 04): which option the member
 * picked, or that they skipped. It lives in the stage, is mirrored to
 * `sessionStorage` under `rewind:quiz:<year>` so a reload keeps it for the
 * tab, and never reaches the server. Storage that throws (private windows,
 * blocked storage) leaves the answer in memory only.
 */
const AnswerSchema = z.union([
  z.strictObject({ key: z.string(), rank: z.number().int().min(1).max(4), title: z.string(), kind: z.enum(["series", "mixed"]) }),
  z.strictObject({ skipped: z.literal(true) }),
])

export type QuizAnswer = z.infer<typeof AnswerSchema>
export type QuizPick = Extract<QuizAnswer, { key: string }>

const storageKey = (year: number) => `rewind:quiz:${year}`

const answers = new Map<number, QuizAnswer | null>()
const listeners = new Set<() => void>()

function read(year: number): QuizAnswer | null {
  if (!answers.has(year)) {
    let stored: QuizAnswer | null = null
    try {
      const raw = window.sessionStorage.getItem(storageKey(year))
      const parsed = raw ? AnswerSchema.safeParse(JSON.parse(raw)) : null
      stored = parsed?.success ? parsed.data : null
    } catch {
      stored = null
    }
    answers.set(year, stored)
  }
  return answers.get(year) ?? null
}

function write(year: number, answer: QuizAnswer): void {
  answers.set(year, answer)
  try {
    window.sessionStorage.setItem(storageKey(year), JSON.stringify(answer))
  } catch {
    // the answer still holds for this page view
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Forgets the in-memory answers, so the next read goes to storage. For tests. @internal */
export function resetQuizAnswers(): void {
  answers.clear()
}

interface QuizState {
  answer: QuizAnswer | null
  setAnswer: (answer: QuizAnswer) => void
}

const QuizContext = createContext<QuizState>({ answer: null, setAnswer: () => {} })

/** The stage's quiz answer for one issue year. */
export function QuizProvider({ year, children }: { year: number; children: ReactNode }) {
  const answer = useSyncExternalStore(
    subscribe,
    () => read(year),
    () => null
  )
  const value = useMemo(() => ({ answer, setAnswer: (next: QuizAnswer) => write(year, next) }), [answer, year])
  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>
}

export function useQuiz(): QuizState {
  return useContext(QuizContext)
}

/** The picked option, or null when the quiz was skipped or not answered yet. */
export function usePick(): QuizPick | null {
  const { answer } = useQuiz()
  return answer && "key" in answer ? answer : null
}
