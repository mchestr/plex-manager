"use client"

import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import type { ProblemAutomaticMode } from "@/lib/generated/prisma/client"

/** The swap limits as typed, so a half-typed number is not lost. */
export interface SwapFieldValues {
  automatic: ProblemAutomaticMode
  weeklySwaps: string
  titleCooldownDays: string
  dailySwapCap: string
}

export type SwapNumberKey = "weeklySwaps" | "titleCooldownDays" | "dailySwapCap"

/** Each limit's bounds, as `problemReportSettingsSchema` takes them. */
const SWAP_BOUNDS: Record<SwapNumberKey, { min: number; max: number }> = {
  weeklySwaps: { min: 1, max: 20 },
  titleCooldownDays: { min: 1, max: 90 },
  dailySwapCap: { min: 1, max: 100 },
}

/** The limits the action would refuse, in words. */
export function invalidSwapFields(values: SwapFieldValues): Partial<Record<SwapNumberKey, string>> {
  const invalid: Partial<Record<SwapNumberKey, string>> = {}
  for (const key of Object.keys(SWAP_BOUNDS) as SwapNumberKey[]) {
    const { min, max } = SWAP_BOUNDS[key]
    const value = Number(values[key])
    if (!/^\d+$/.test(values[key].trim()) || value < min || value > max) invalid[key] = `Enter a whole number from ${min} to ${max}`
  }
  return invalid
}

const MODES: { value: ProblemAutomaticMode; label: string; hint: string }[] = [
  { value: "OFF", label: "Off", hint: "Reports a swap would fix come to you, as before." },
  { value: "DRY_RUN", label: "Dry run", hint: "Each swap a member's report would start finds its copy, then comes to you to run in one tap. Nothing changes on its own." },
  { value: "ON", label: "On", hint: "Members swap a bad copy themselves, within the limits below, and fix a title Plex matched wrongly." },
]

interface SwapSettingsFieldsProps {
  values: SwapFieldValues
  errors: Partial<Record<SwapNumberKey, string>>
  /** Radarr and Sonarr set up without a recycle bin, which keep On off. */
  missingBins: ("Radarr" | "Sonarr")[]
  disabled: boolean
  onChange: (change: Partial<SwapFieldValues>) => void
}

/**
 * Members' swaps in the settings card: Off, Dry run or On, and the limits.
 * On needs a recycle bin in each of Radarr and Sonarr that is set up, so a
 * bad swap can be undone; without one, On stays disabled and says which.
 */
export function SwapSettingsFields({ values, errors, missingBins, disabled, onChange }: SwapSettingsFieldsProps) {
  const noBin = missingBins.length > 0
  const number = (key: SwapNumberKey, label: string, description: string) => (
    <FormField name={`problem-reports-${key}`} label={label} description={description} error={errors[key]}>
      <Input
        type="number"
        min={SWAP_BOUNDS[key].min}
        max={SWAP_BOUNDS[key].max}
        step={1}
        value={values[key]}
        onValueChange={(next) => onChange({ [key]: next })}
        disabled={disabled}
        data-testid={`admin-problem-reports-${key}`}
      />
    </FormField>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span id="admin-problem-reports-automatic-label" className="text-label text-muted-foreground">
          Members&apos; swaps
        </span>
        <RadioGroup
          value={values.automatic}
          onValueChange={(automatic) => onChange({ automatic })}
          aria-labelledby="admin-problem-reports-automatic-label"
          disabled={disabled}
          data-testid="admin-problem-reports-automatic"
        >
          {MODES.map((mode) => (
            <RadioCard key={mode.value} value={mode.value} disabled={mode.value === "ON" && noBin && values.automatic !== "ON"} data-testid={`admin-problem-reports-automatic-${mode.value.toLowerCase()}`}>
              <span className="flex flex-col">
                <span className="text-ui text-foreground">{mode.label}</span>
                <span className="text-label text-muted-foreground">{mode.hint}</span>
              </span>
            </RadioCard>
          ))}
        </RadioGroup>
        {noBin && (
          <p className="text-label text-muted-foreground" data-testid="admin-problem-reports-recycle-bin">
            On needs a recycle bin in {missingBins.join(" and ")}, so a bad swap can be undone. Set one in its Media Management settings.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {number("weeklySwaps", "Swaps per member", "In any 7 days. A swap counts from its grab, and not when no new copy came in.")}
        {number("titleCooldownDays", "Days between swaps of a title", "After a member's swap of a title, the next one is yours.")}
        {number("dailySwapCap", "Members' swaps a day", "Across every member. The breaker for file replacements still applies.")}
      </div>
    </div>
  )
}
