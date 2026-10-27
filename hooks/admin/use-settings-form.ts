"use client"

import { useState, useTransition } from "react"

/** What a settings form reports to its `SettingsSection` (ui-design-system 5.5). */
export interface SettingsFormState {
  isDirty: boolean
  isPending: boolean
  /** Puts the saved values back and clears the form's field errors. */
  onDiscard: () => void
  /** Resolves true when every write succeeded, so the section can leave edit mode. */
  onSave: () => Promise<boolean>
  /** Disables Test and Save with this reason (P10.20 sets it while a secret must be re-entered). */
  blockedReason?: string
}

/** How a save went: `keep` holds the values to show after a success (a typed secret cleared, say). */
export type SaveOutcome<T> = { ok: true; keep?: T } | { ok: false }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The one editing pattern of the settings page: a section opens read-only,
 * and Edit shows this form with the saved values filled in. It is dirty
 * while the values differ from `initial`, Discard restores them, and when a
 * save refreshes the page with new saved values the form follows them.
 *
 * `save` runs inside a transition, so `isPending` covers it, and says whether
 * it worked; `onSave` resolves with that, which the section uses to return
 * to its summary or stay open with the errors.
 *
 * @example
 * ```ts
 * const settings = useSettingsForm({ name: "Home" }, async (values) => {
 *   const result = await rename(values)
 *   return { ok: result.success }
 * })
 * settings.set({ name: "Den" })   // settings.form.isDirty === true
 * settings.form.onDiscard()       // values back to { name: "Home" }
 * ```
 */
export function useSettingsForm<T>(initial: T, save: (values: T) => Promise<SaveOutcome<T>>) {
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
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          let outcome: SaveOutcome<T>
          try {
            outcome = await save(values)
          } catch (error) {
            // A rejected call (the network, not a refused save): settle, then let the error boundary have it
            resolve(false)
            throw error
          }
          if (outcome.ok && outcome.keep) setValues(outcome.keep)
          resolve(outcome.ok)
        })
      }),
  }

  return {
    values,
    set: (patch: Partial<T>) => setValues((prev) => ({ ...prev, ...patch })),
    form,
  }
}
