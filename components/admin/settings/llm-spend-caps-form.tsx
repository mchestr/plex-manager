"use client"

import { useState } from "react"

import { updateLlmCaps } from "@/actions/admin/admin-config"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { useFormat } from "@/lib/format-context"

export interface SpendCaps {
  perUserUsd: number
  adminUsd: number
  serverUsd: number
}

const FIELDS = [
  { key: "perUserUsd", id: "llm-cap-user", summary: "user", label: "Per member", off: "for members", action: "llmDailyCapPerUserUsd" },
  { key: "adminUsd", id: "llm-cap-admin", summary: "admin", label: "Per admin", off: "for admins", action: "llmDailyCapAdminUsd" },
  { key: "serverUsd", id: "llm-cap-server", summary: "server", label: "Whole server", off: "for everyone", action: "llmDailyCapServerUsd" },
] as const

type CapKey = (typeof FIELDS)[number]["key"]
type CapValues = Record<CapKey, string>

const INVALID = "Enter 0 or more"

function isInvalid(value: string) {
  const parsed = Number(value)
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0
}

/**
 * The assistant's daily spend caps as part of the AI section's form, shown
 * after Edit: values, dirty state and Save through the section footer. An
 * empty or negative cap stops the save, which keeps the section open. They
 * cover the admin assistant and the Discord assistant, not Rewind.
 */
export function useSpendCapsForm(caps: SpendCaps) {
  const toast = useToast()
  const [errors, setErrors] = useState<Partial<Record<CapKey, string>>>({})
  const initial: CapValues = { perUserUsd: String(caps.perUserUsd), adminUsd: String(caps.adminUsd), serverUsd: String(caps.serverUsd) }

  const settings = useSettingsForm(initial, async (values) => {
    const invalid = FIELDS.filter(({ key }) => isInvalid(values[key]))
    if (invalid.length) {
      setErrors(Object.fromEntries(invalid.map(({ key }) => [key, INVALID])))
      return { ok: false }
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
      return { ok: false }
    }
    // The action revalidates the page, so the stored caps follow
    setErrors({})
    toast.showSuccess("Assistant spend caps saved")
    return { ok: true }
  })

  const form = {
    ...settings.form,
    onDiscard: () => {
      settings.form.onDiscard()
      setErrors({})
    },
  }

  return { values: settings.values, set: settings.set, errors, form }
}

type SpendCapsForm = ReturnType<typeof useSpendCapsForm>

/** The three caps, in US dollars per server-zone day; an empty or negative one shows its error at once. */
export function LlmSpendCapsFields({ state, disabled }: { state: SpendCapsForm; disabled?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-3" data-testid="llm-spend-caps-form">
      <legend className="text-ui font-medium text-foreground">Daily spend caps (USD)</legend>
      <p className="text-label text-muted-foreground">
        At a cap, the assistant stops until midnight, server time. A cap of 0 turns off the assistant for that group.
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

/**
 * The saved caps in the AI section's view mode, in the form's three columns:
 * "$0.50 a day", and a cap of 0 says the assistant is off for that group.
 */
export function SpendCapsSummary({ caps }: { caps: SpendCaps }) {
  const f = useFormat()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-ui font-medium text-foreground">Daily spend caps</h3>
        <p className="text-label text-muted-foreground">At a cap, the assistant stops until midnight, server time.</p>
      </div>
      <SettingsSummary className="sm:grid-cols-3 md:grid-cols-3" data-testid="settings-ai-summary-caps">
        {FIELDS.map(({ key, summary, label, off }) => (
          <SettingsSummaryRow key={key} label={label} data-testid={`settings-ai-summary-caps-${summary}`}>
            {f.money(caps[key], "prose")} a day{caps[key] === 0 && `, assistant off ${off}`}
          </SettingsSummaryRow>
        ))}
      </SettingsSummary>
    </div>
  )
}
