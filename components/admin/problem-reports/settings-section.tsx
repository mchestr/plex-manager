"use client"

import type { ReactNode } from "react"

import { updateProblemReportSettings } from "@/actions/admin/problem-reports"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"

interface ProblemReportSettingsSectionProps {
  enabled: boolean
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/**
 * The Problem reports tab's settings card, below the list: the feature
 * switch, read-only until Edit and saved by the section's footer. The switch
 * is a Checkbox because it saves with Save.
 */
export function ProblemReportSettingsSection({ enabled, footerMeta }: ProblemReportSettingsSectionProps) {
  const toast = useToast()
  const settings = useSettingsForm({ enabled }, async (values) => {
    const result = await updateProblemReportSettings(values)
    if (!result.success) {
      toast.showError(result.error)
      return { ok: false }
    }
    toast.showSuccess(values.enabled ? "Problem reports turned on" : "Problem reports turned off")
    return { ok: true }
  })

  return (
    <SettingsSection
      id="problem-reports"
      title="Settings"
      description="Members tell you about titles that won't play right, look wrong or are missing episodes, from Report a problem."
      form={settings.form}
      view={
        <SettingsSummary data-testid="settings-problem-reports-summary">
          <SettingsSummaryRow label="Problem reports" data-testid="settings-problem-reports-summary-enabled">
            {enabled ? "On" : "Off"}
          </SettingsSummaryRow>
        </SettingsSummary>
      }
      footerMeta={footerMeta}
    >
      <div className="flex items-start gap-3" data-testid="admin-problem-reports-settings">
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
    </SettingsSection>
  )
}
