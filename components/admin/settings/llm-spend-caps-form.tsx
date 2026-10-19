"use client"

import { updateLlmCaps } from "@/actions/admin"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/styled-input"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface LlmSpendCapsFormProps {
  perUserUsd: number
  adminUsd: number
  serverUsd: number
}

const FIELDS = [
  { key: "perUserUsd", id: "llm-cap-user", label: "Per member" },
  { key: "adminUsd", id: "llm-cap-admin", label: "Per admin" },
  { key: "serverUsd", id: "llm-cap-server", label: "Whole server" },
] as const

type CapKey = (typeof FIELDS)[number]["key"]

/**
 * The assistant's daily spend caps, in US dollars per server-zone day. They
 * cover the admin assistant and the Discord assistant, not Rewind.
 */
export function LlmSpendCapsForm(caps: LlmSpendCapsFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<CapKey, string>>({
    perUserUsd: String(caps.perUserUsd),
    adminUsd: String(caps.adminUsd),
    serverUsd: String(caps.serverUsd),
  })

  const parsed = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(values[key])])) as Record<CapKey, number>
  const isInvalid = (key: CapKey) => values[key].trim() === "" || !Number.isFinite(parsed[key]) || parsed[key] < 0
  const invalid = FIELDS.some(({ key }) => isInvalid(key))

  const save = () => {
    startTransition(async () => {
      const result = await updateLlmCaps({
        llmDailyCapPerUserUsd: parsed.perUserUsd,
        llmDailyCapAdminUsd: parsed.adminUsd,
        llmDailyCapServerUsd: parsed.serverUsd,
      })
      if (result.success) {
        toast.showSuccess("Assistant spend caps saved")
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update the assistant spend caps")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-card p-3" data-testid="llm-spend-caps-form">
      <h4 className="text-xs font-medium">Daily spend caps (USD)</h4>
      <p className="text-xs text-muted-foreground">
        The assistant stops answering once a cap is reached, and starts again at midnight server time. A cap of 0 turns the
        assistant off for that group.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {FIELDS.map(({ key, id, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-xs">
              {label}
            </label>
            <StyledInput
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={0.01}
              value={values[key]}
              onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
              disabled={isPending}
              error={isInvalid(key)}
              data-testid={id}
            />
          </div>
        ))}
      </div>
      <div>
        <Button type="button" variant="secondary" onClick={save} disabled={isPending || invalid} data-testid="llm-caps-save">
          {isPending ? "Saving..." : "Save caps"}
        </Button>
      </div>
    </div>
  )
}
