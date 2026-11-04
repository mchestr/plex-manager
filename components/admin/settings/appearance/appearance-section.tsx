"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { updateAppearance } from "@/actions/admin/branding"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { ACCENT_PATTERN } from "@/lib/branding/accent"

export interface AppearanceValues {
  /** `Config.serverName`; blank falls back to the Plex server's name. */
  serverName: string
  loginSubtitle: string
  /** `#RRGGBB`; blank keeps the default amber. */
  accentColor: string
}

type FieldErrors = Partial<Record<keyof AppearanceValues, string>>

/** A small square of the colour, beside its hex code. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 rounded-[3px] border border-border-strong"
      style={ACCENT_PATTERN.test(color) ? { backgroundColor: color } : undefined}
    />
  )
}

function AppearanceSummary({ saved, fallbackName }: { saved: AppearanceValues; fallbackName: string }) {
  return (
    <SettingsSummary data-testid="settings-appearance-summary">
      <SettingsSummaryRow label="Server name" data-testid="settings-appearance-summary-server-name">
        {saved.serverName || <NotSet>{`Not set (using ${fallbackName})`}</NotSet>}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Login subtitle" data-testid="settings-appearance-summary-login-subtitle">
        {saved.loginSubtitle || <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Accent colour" mono data-testid="settings-appearance-summary-accent">
        {saved.accentColor ? (
          <span className="flex items-center gap-2">
            <Swatch color={saved.accentColor} />
            {saved.accentColor}
          </span>
        ) : (
          <NotSet>Default</NotSet>
        )}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * Appearance: the server name members see, the line under it on the sign-in
 * screen and the accent colour (`lib/branding/accent.ts`). It opens
 * read-only; Edit shows the fields, saved through the section footer.
 */
export function AppearanceSection({
  saved,
  fallbackName,
  footerMeta,
}: {
  saved: AppearanceValues
  /** The name in use when none is saved: the Plex or Jellyfin server's. */
  fallbackName: string
  footerMeta?: ReactNode
}) {
  const toast = useToast()
  const [errors, setErrors] = useState<FieldErrors>({})
  const settings = useSettingsForm(saved, async (values) => {
    const result = await updateAppearance(values)
    if (!result.success) {
      const fieldErrors = result.fieldErrors ?? {}
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0]])))
      if (!result.fieldErrors) toast.showError(result.error)
      return { ok: false }
    }
    setErrors({})
    toast.showSuccess("Appearance saved")
    return { ok: true }
  })
  const set = (patch: Partial<AppearanceValues>) => {
    settings.set(patch)
    setErrors({})
  }
  const { values } = settings
  const disabled = settings.form.isPending

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      description="The name, sign-in line and colour members see."
      form={{ ...settings.form, onDiscard: () => (settings.form.onDiscard(), setErrors({})) }}
      footerMeta={footerMeta}
      view={<AppearanceSummary saved={saved} fallbackName={fallbackName} />}
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2" data-testid="appearance-form">
        <FormField name="serverName" label="Server name" optional description={`Blank uses ${fallbackName}.`} error={errors.serverName}>
          <Input
            value={values.serverName}
            onChange={(event) => set({ serverName: event.target.value })}
            maxLength={60}
            placeholder={fallbackName}
            disabled={disabled}
            data-testid="appearance-server-name"
          />
        </FormField>
        <FormField name="loginSubtitle" label="Login subtitle" optional description="A line under the name on the sign-in screen." error={errors.loginSubtitle}>
          <Input
            value={values.loginSubtitle}
            onChange={(event) => set({ loginSubtitle: event.target.value })}
            maxLength={120}
            disabled={disabled}
            data-testid="appearance-login-subtitle"
          />
        </FormField>
        <FormField
          name="accentColor"
          label="Accent colour"
          optional
          description="Buttons, links and focus rings, as #RRGGBB. Each theme adjusts it to stay readable. Blank uses the default."
          error={errors.accentColor}
        >
          <Input
            value={values.accentColor}
            onChange={(event) => set({ accentColor: event.target.value })}
            maxLength={7}
            placeholder="#E4202B"
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            leading={<Swatch color={values.accentColor} />}
            disabled={disabled}
            data-testid="appearance-accent-color"
          />
        </FormField>
      </div>
    </SettingsSection>
  )
}
