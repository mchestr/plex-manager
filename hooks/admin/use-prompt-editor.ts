"use client"

import { startTransition, useActionState, useEffect, useState } from "react"

export interface PromptEditorValues {
  name: string
  description: string
  template: string
  isActive: boolean
}

export type PromptSaveResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string; fieldErrors?: Record<string, string[] | undefined> }

/** idle: nothing changed; dirty: unsaved edits; saving; saved: the last save took; error: it didn't. */
export type PromptEditorStatus = "idle" | "dirty" | "saving" | "saved" | "error"

interface UsePromptEditorOptions {
  /** The saved values the form opened with. */
  initial: PromptEditorValues
  /** The form's current values; the component owns them (the text has its own undo history). */
  values: PromptEditorValues
  save: (values: PromptEditorValues) => Promise<PromptSaveResult>
  onSaved?: (id: string, values: PromptEditorValues) => void
}

const same = (a: PromptEditorValues, b: PromptEditorValues) =>
  a.name === b.name && a.description === b.description && a.template === b.template && a.isActive === b.isActive

/**
 * The editor's save (P10.4): `useActionState` around the action, the status
 * the footer shows, the server's field errors, and a browser prompt before
 * leaving with unsaved changes. A failed save keeps the text as typed.
 */
export function usePromptEditor({ initial, values, save, onSaved }: UsePromptEditorOptions) {
  const [baseline, setBaseline] = useState(initial)

  const [result, dispatch, isPending] = useActionState(
    async (_previous: PromptSaveResult | null, payload: PromptEditorValues) => {
      const next = await save(payload)
      if (next.success) {
        setBaseline(payload)
        onSaved?.(next.data.id, payload)
      }
      return next
    },
    null
  )

  const dirty = !same(values, baseline)
  const status: PromptEditorStatus = isPending
    ? "saving"
    : result && !result.success
      ? "error"
      : dirty
        ? "dirty"
        : result?.success
          ? "saved"
          : "idle"

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const submit = () => startTransition(() => dispatch(values))

  return {
    status,
    dirty,
    submit,
    error: result && !result.success ? result.error : null,
    fieldErrors: result && !result.success ? (result.fieldErrors ?? {}) : {},
  }
}
