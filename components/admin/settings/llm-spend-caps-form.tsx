"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { updateLlmCaps } from "@/actions/admin"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"

export interface SpendCaps {
  perUserUsd: number
  adminUsd: number
  serverUsd: number
}

const FIELDS = [
  { key: "perUserUsd", id: "llm-cap-user", label: "Per member", action: "llmDailyCapPerUserUsd" },
  { key: "adminUsd", id: "llm-cap-admin", label: "Per admin", action: "llmDailyCapAdminUsd" },
  { key: "serverUsd", id: "llm-cap-server", label: "Whole server", action: "llmDailyCapServerUsd" },
] as const

type CapKey = (typeof FIELDS)[number]["key"]
type CapValues = Record<CapKey, string>

const INVALID = "Enter 0 or more"

function isInvalid(value: string) {
  const parsed = Number(value)
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0
}

/**
 * The assistant's daily spend caps as part of the AI section's form (UI-31):
 * values, dirty state and Save through the section footer. They cover the
 * admin assistant and the Discord assistant, not Rewind.
 */
export function useSpendCapsForm(caps: SpendCaps) {
  const router = useRouter()
  const toast = useToast()
  const [errors, setErrors] = useState<Partial<Record<CapKey, string>>>({})
  const initial: CapValues = { perUserUsd: String(caps.perUserUsd), adminUsd: String(caps.adminUsd), serverUsd: String(caps.serverUsd) }

  const settings = useSettingsForm(initial, async (values) => {
    const invalid = FIELDS.filter(({ key }) => isInvalid(values[key]))
    if (invalid.length) {
      setErrors(Object.fromEntries(invalid.map(({ key }) => [key, INVALID])))
      return
    }
    const result = await updateLlmCaps({
      llmDailyCapPerUserUsd: Number(values.perUserUsd),
      llmDailyCapAdminUsd: Number(values.adminUsd),
      llmDailyCapServerUsd: Number(values.serverUsd),
    })
    if (!result.success) {
      const fieldErrors = Object.fromEntries(
        FIELDS.flatMap(({ key, action }) => (result.fieldErrors?.[action]?.[0] ? [[key, result.fieldErrors[action][0]]] : []))
      )
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0) toast.showError(result.error)
      return
    }
    setErrors({})
    toast.showSuccess("Assistant spend caps saved")
    router.refresh()
  })

  return { values: settings.values, set: settings.set, errors, form: settings.form }
}

type SpendCapsForm = ReturnType<typeof useSpendCapsForm>

/** The three caps, in US dollars per server-zone day; an empty or negative one shows its error at once. */
export function LlmSpendCapsFields({ state, disabled }: { state: SpendCapsForm; disabled?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3" data-testid="llm-spend-caps-form">
      <legend className="text-ui font-medium text-foreground">Daily spend caps (USD)</legend>
      <p className="text-label text-muted-foreground">
        The assistant stops answering once a cap is reached, and starts again at midnight server time. A cap of 0 turns the assistant off
        for that group.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FIELDS.map(({ key, id, label }) => (
          <FormField key={key} name={id} label={label} error={isInvalid(state.values[key]) ? INVALID : state.errors[key]}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={0.01}
              value={state.values[key]}
              onValueChange={(value) => state.set({ [key]: value })}
              disabled={disabled}
              data-testid={id}
            />
          </FormField>
        ))}
      </div>
    </fieldset>
  )
}
