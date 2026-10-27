"use client"

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react"

import type { SettingsFormState } from "@/hooks/admin/use-settings-form"

/** What a Sheet hands its form: every prop is optional, so a form also renders on its own. */
export interface SheetFormControls {
  /** Closes the Sheet at once: after a save, a Save with nothing changed, or a removal. */
  onDone?: () => void
  /** Cancel: closes the Sheet, asking first when there are unsaved changes. */
  onCancel?: () => void
  /** The form says whether it has unsaved changes, for the close guard. */
  onDirtyChange?: (dirty: boolean) => void
  /** The form says whether a save is in flight, while which nothing closes the Sheet. */
  onPendingChange?: (pending: boolean) => void
}

interface SheetFormProps extends SheetFormControls {
  form: SettingsFormState
  children: ReactNode
  "data-testid": string
}

/**
 * The `<form>` inside a `SettingsSheet`, with the section rules: Save with
 * nothing changed just closes, a successful save closes, and a failed one
 * stays open on the first field that says what is wrong. Errors show on
 * their fields, so the browser's own validation is off and a blocked submit
 * still reaches the server, which refuses on the same rule (SEC-31).
 */
export function SheetForm({ form, onDone, onDirtyChange, onPendingChange, children, "data-testid": testId }: SheetFormProps) {
  const ref = useRef<HTMLFormElement>(null)
  const [failures, setFailures] = useState(0)
  const { isDirty, isPending } = form

  // A real effect: the Sheet around the form guards its close with these
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [onDirtyChange, isDirty])
  useEffect(() => {
    onPendingChange?.(isPending)
  }, [onPendingChange, isPending])
  useEffect(
    () => () => {
      onDirtyChange?.(false)
      onPendingChange?.(false)
    },
    [onDirtyChange, onPendingChange]
  )

  // A real effect: after a failed save, once the fields are enabled again and
  // marked invalid, focus the first one
  useEffect(() => {
    if (failures > 0 && !isPending) ref.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
  }, [failures, isPending])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isPending) return
    if (!isDirty) {
      onDone?.()
      return
    }
    void form.onSave().then((ok) => (ok ? onDone?.() : setFailures((n) => n + 1)))
  }

  return (
    <form ref={ref} onSubmit={submit} noValidate className="flex flex-col gap-6" data-testid={testId}>
      {children}
    </form>
  )
}
