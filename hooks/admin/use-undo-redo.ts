"use client"

import { useCallback, useReducer } from "react"

interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** When the present entry was last typed into; null after an undo, redo or reset. */
  lastAt: number | null
}

type HistoryAction<T> =
  | { type: "set"; value: T; at: number; limit: number; coalesceMs: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T }

function reducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case "set": {
      if (Object.is(action.value, state.present)) return state
      const coalesce = state.lastAt !== null && action.at - state.lastAt < action.coalesceMs
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-action.limit),
        present: action.value,
        future: [],
        lastAt: action.at,
      }
    }
    case "undo": {
      const previous = state.past.at(-1)
      if (state.past.length === 0 || previous === undefined) return state
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], lastAt: null }
    }
    case "redo": {
      const [next, ...rest] = state.future
      if (state.future.length === 0 || next === undefined) return state
      return { past: [...state.past, state.present], present: next, future: rest, lastAt: null }
    }
    case "reset":
      return { past: [], present: action.value, future: [], lastAt: null }
  }
}

interface UndoRedoOptions {
  /** The most undo steps kept. */
  limit?: number
  /** Changes closer together than this are one step, so a typed word undoes at once. */
  coalesceMs?: number
}

/**
 * A value with an undo and redo history (P10.4): up to `limit` steps, with
 * changes within `coalesceMs` of each other merged into one. A new change
 * clears the redo stack; `reset` starts a fresh history (after a save).
 */
export function useUndoRedo<T>(initial: T, { limit = 100, coalesceMs = 500 }: UndoRedoOptions = {}) {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [], lastAt: null })

  const set = useCallback(
    (value: T) => dispatch({ type: "set", value, at: Date.now(), limit, coalesceMs }),
    [limit, coalesceMs]
  )
  const undo = useCallback(() => dispatch({ type: "undo" }), [])
  const redo = useCallback(() => dispatch({ type: "redo" }), [])
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), [])

  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
