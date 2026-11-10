"use client"

import { use, useState, type ReactNode } from "react"

import { updateProblemReportSettings } from "@/actions/admin/problem-reports"
import { invalidSwapFields, SwapSettingsFields, type SwapFieldValues, type SwapNumberKey } from "@/components/admin/problem-reports/swap-settings-fields"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { ProblemAutomaticMode } from "@/lib/generated/prisma/client"

interface ProblemReportSettingsSectionProps {
  saved: { enabled: boolean; automatic: ProblemAutomaticMode; weeklySwaps: number; titleCooldownDays: number; dailySwapCap: number }
  /** Radarr and Sonarr set up without a recycle bin, read as the page streams. */
  recycleBins: Promise<("Radarr" | "Sonarr")[]>
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

interface Values extends SwapFieldValues {
  enabled: boolean
}

const MODE_WORDS: Record<ProblemAutomaticMode, string> = { OFF: "Off", DRY_RUN: "Dry run", ON: "On" }

/**
 * The Problem reports tab's settings card, below the list: the feature
 * switch, and members' swaps (Off, Dry run or On) with their limits,
 * read-only until Edit and saved by the section's footer. The switch is a
 * Checkbox because it saves with Save.
 */
export function ProblemReportSettingsSection({ saved, recycleBins, footerMeta }: ProblemReportSettingsSectionProps) {
  const missingBins = use(recycleBins)
  const toast = useToast()
  const [errors, setErrors] = useState<Partial<Record<SwapNumberKey, string>>>({})
  const initial: Values = {
    enabled: saved.enabled,
    automatic: saved.automatic,
    weeklySwaps: String(saved.weeklySwaps),
    titleCooldownDays: String(saved.titleCooldownDays),
    dailySwapCap: String(saved.dailySwapCap),
  }
  const settings = useSettingsForm(initial, async (values) => {
    const invalid = invalidSwapFields(values)
    setErrors(invalid)
    if (Object.keys(invalid).length > 0) return { ok: false }
    const result = await updateProblemReportSettings({
      enabled: values.enabled,
      automatic: values.automatic,
      weeklySwaps: Number(values.weeklySwaps),
      titleCooldownDays: Number(values.titleCooldownDays),
      dailySwapCap: Number(values.dailySwapCap),
    })
    if (!result.success) {
      toast.showError(result.error)
      return { ok: false }
    }
    toast.showSuccess("Problem report settings saved")
    return { ok: true }
  })
  const row = (key: string) => `settings-problem-reports-summary-${key}`

  return (
    <SettingsSection
      id="problem-reports"
      title="Settings"
      description="Members tell you about titles that won't play right, look wrong or are missing episodes, from Report a problem."
      form={settings.form}
      view={
        <SettingsSummary data-testid="settings-problem-reports-summary">
          <SettingsSummaryRow label="Problem reports" data-testid={row("enabled")}>
            {saved.enabled ? "On" : "Off"}
          </SettingsSummaryRow>
          <SettingsSummaryRow label="Members' swaps" data-testid={row("automatic")}>
            {MODE_WORDS[saved.automatic]}
          </SettingsSummaryRow>
          <SettingsSummaryRow label="Limits" data-testid={row("limits")}>
            {saved.weeklySwaps} per member in any 7 days, a title every {saved.titleCooldownDays} days, {saved.dailySwapCap} a day in all
          </SettingsSummaryRow>
        </SettingsSummary>
      }
      footerMeta={footerMeta}
    >
      <div className="flex flex-col gap-6" data-testid="admin-problem-reports-settings">
        <div className="flex items-start gap-3">
          <Checkbox
            id="admin-problem-reports-enabled"
            checked={settings.values.enabled}
            onCheckedChange={(next) => settings.set({ enabled: next })}
            disabled={settings.form.isPending}
            aria-describedby="admin-problem-reports-enabled-hint"
            className="mt-0.5"
            data-testid="admin-problem-reports-enabled-toggle"
          />
          <div className="flex flex-col">
            <Label htmlFor="admin-problem-reports-enabled">Members can report problems</Label>
            <span id="admin-problem-reports-enabled-hint" className="text-label text-muted-foreground">
              Help and the Home page link to Report a problem. Turned off, members still see and can cancel the reports they
              made, and you keep every report here.
            </span>
          </div>
        </div>
        <SwapSettingsFields values={settings.values} errors={errors} missingBins={missingBins} disabled={settings.form.isPending} onChange={settings.set} />
      </div>
    </SettingsSection>
  )
}
