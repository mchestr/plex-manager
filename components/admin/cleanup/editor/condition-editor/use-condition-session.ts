"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { editorFocusPart, type EditorFocusPart } from "@/lib/cleanup/editor/focus"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"

import { type ChangeMode, conditionError, focusTarget } from "./editor-parts"

/** Typed numbers reach the preview 500 ms after the last key (UX 7.3 item 3, UX 7.11 item 2). */
const TYPED_DELAY_MS = 500

/** A focus move after a render: to the control with the error when `invalid`, else to the part. */
type FocusRequest = { part: EditorFocusPart; invalid: boolean; n: number }

interface Session {
  open: boolean
  /** The local copy the editor changes (TS 12.6). */
  local: DraftCondition
  /** The value error that shows, set on blur, on Done and on a chip or select change (UX 4.4 item 5). */
  error: string | null
  /** The field picker list is open: a new row opens with it (UX 7.1 item 3). */
  picker: boolean
  /** The part that took focus when the editor opened. */
  openPart: EditorFocusPart
  focus: FocusRequest | null
}

const start = (open: boolean, condition: DraftCondition, part: EditorFocusPart): Session => ({
  open,
  local: condition,
  error: null,
  picker: part === "fieldSearch",
  openPart: part,
  focus: null,
})

interface SessionOptions {
  open: boolean
  condition: DraftCondition
  focusPart: EditorFocusPart
  onDraftChange: (condition: DraftCondition) => void
}

/**
 * One editing session of the condition editor: the local copy, taken from
 * `condition` each time the editor opens, the debounced `onDraftChange`, the
 * value error, the field picker, and focus. Chips, selects and the operator
 * send their change at once. Typed numbers send it 500 ms after the last key,
 * or at once on blur, Enter or a stepper.
 */
export function useConditionSession({ open, condition, focusPart, onDraftChange }: SessionOptions) {
  const [session, setSession] = useState(() => start(open, condition, focusPart))
  if (open && (!session.open || session.local.id !== condition.id)) setSession(start(true, condition, focusPart))
  else if (!open && session.open) setSession({ ...session, open: false })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(onDraftChange)
  const body = useRef<HTMLDivElement | null>(null)
  const initialFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    latest.current = onDraftChange
  })

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  // A closed or unmounted editor sends nothing late.
  useEffect(() => {
    if (!open) cancelTimer()
    return cancelTimer
  }, [open, cancelTimer])

  // Moves focus after the render that made the target (a chosen field's value, the control with the error).
  useEffect(() => {
    const request = session.focus
    const root = body.current
    if (!request || !root) return
    const invalid = request.invalid ? root.querySelector<HTMLElement>('[aria-invalid="true"]') : null
    ;(invalid ?? focusTarget(root, request.part))?.focus()
  }, [session.focus])

  /** The body's ref: it also names the control that takes focus on open, which the popup reads after it mounts. */
  const openPart = session.openPart
  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      body.current = node
      if (node) initialFocus.current = focusTarget(node, openPart)
    },
    [openPart]
  )

  const change = (next: DraftCondition, mode: ChangeMode) => {
    setSession((s) => {
      const message = conditionError(next)
      // A typed key never adds an error, but a valid value clears one (UX 4.4 item 5).
      const error = mode === "typed" ? (message === null ? null : s.error) : message
      return { ...s, local: next, error }
    })
    cancelTimer()
    if (mode === "typed") {
      timer.current = setTimeout(() => {
        timer.current = null
        latest.current(next)
      }, TYPED_DELAY_MS)
    } else {
      latest.current(next)
    }
  }

  /** Done, Enter and the closes that apply: the value check, which shows the error and moves focus to it. */
  const check = (): string | null => {
    const message = conditionError(session.local)
    const part = editorFocusPart(session.local, "value")
    if (message !== null) setSession((s) => ({ ...s, error: message, focus: { part, invalid: true, n: (s.focus?.n ?? 0) + 1 } }))
    else cancelTimer()
    return message
  }

  /** Moves focus to a part after the next render: the value of a chosen field (UX 7.1 item 6). */
  const moveFocus = (part: EditorFocusPart) =>
    setSession((s) => ({ ...s, focus: { part, invalid: false, n: (s.focus?.n ?? 0) + 1 } }))
  const setPicker = (picker: boolean) => setSession((s) => ({ ...s, picker }))

  return {
    local: session.local,
    error: session.error,
    picker: session.picker,
    setPicker,
    change,
    check,
    /** Esc, Cancel and Remove: nothing typed is sent late. */
    discard: cancelTimer,
    moveFocus,
    bodyRef,
    initialFocus,
  }
}
