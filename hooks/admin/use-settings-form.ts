"use client"

import { useState, useTransition } from "react"

/** What a settings form reports to its `SettingsSection` (ui-design-system 5.5). */
export interface SettingsFormState {
  isDirty: boolean
  isPending: boolean
  onDiscard: () => void
  onSave: () => void
  /** Disables Test and Save with this reason (P10.20 sets it while a secret must be re-entered). */
  blockedReason?: string
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The one editing pattern of the settings page (UI-31): an always-open form
 * whose values start from the saved ones. It is dirty while the values differ
 * from `initial`, Discard restores them, and when a save refreshes the page
 * with new saved values the form follows them.
 *
 * `save` runs inside a transition, so `isPending` covers it. It returns the
 * values to keep after a successful save (a typed secret cleared, say), or
 * nothing to keep the form as it is.
 *
 * @example
 * ```ts
 * const settings = useSettingsForm({ name: "Home" }, async (values) => { await rename(values) })
 * settings.set({ name: "Den" })   // settings.form.isDirty === true
 * settings.form.onDiscard()       // values back to { name: "Home" }
 * ```
 */
export function useSettingsForm<T>(initial: T, save: (values: T) => Promise<T | void>) {
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [isPending, startTransition] = useTransition()

  // Follow the stored values after a save refreshes the page
  if (!same(saved, initial)) {
    setSaved(initial)
    setValues(initial)
  }

  const form: SettingsFormState = {
    isDirty: !same(values, initial),
    isPending,
    onDiscard: () => setValues(initial),
    onSave: () =>
      startTransition(async () => {
        const kept = await save(values)
        if (kept) setValues(kept)
      }),
  }

  return {
    values,
    set: (patch: Partial<T>) => setValues((prev) => ({ ...prev, ...patch })),
    form,
  }
}
