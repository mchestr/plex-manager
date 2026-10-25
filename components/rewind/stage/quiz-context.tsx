"use client"

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react"

/**
 * The quiz answer (Rewind design 4.3, page 04): which option the member
 * picked, or that they skipped. It lives in the stage, is mirrored to
 * `sessionStorage` under `rewind:quiz:<year>` so a reload keeps it for the
 * tab, and never reaches the server. Storage that throws (private windows,
 * blocked storage) leaves the answer in memory only.
 */
export type QuizPick = { key: string; rank: number; title: string; kind: "series" | "mixed" }
export type QuizAnswer = QuizPick | { skipped: true }

/**
 * A stored answer, read without Zod (the stage's first page loads this
 * module, P7.15): exactly a pick's four fields with a rank of 1 to 4, or
 * exactly `{ skipped: true }`; anything else is null.
 */
function parseAnswer(value: unknown): QuizAnswer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const stored = value as Record<string, unknown>
  const keys = Object.keys(stored).sort().join(",")
  if (keys === "skipped") return stored.skipped === true ? { skipped: true } : null
  if (keys !== "key,kind,rank,title") return null
  const { key, rank, title, kind } = stored
  const validRank = typeof rank === "number" && Number.isInteger(rank) && rank >= 1 && rank <= 4
  if (typeof key !== "string" || typeof title !== "string" || !validRank || (kind !== "series" && kind !== "mixed")) return null
  return { key, rank, title, kind }
}

const storageKey = (year: number) => `rewind:quiz:${year}`

const answers = new Map<number, QuizAnswer | null>()
const listeners = new Set<() => void>()

function read(year: number): QuizAnswer | null {
  if (!answers.has(year)) {
    let stored: QuizAnswer | null
    try {
      const raw = window.sessionStorage.getItem(storageKey(year))
      stored = raw ? parseAnswer(JSON.parse(raw)) : null
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
