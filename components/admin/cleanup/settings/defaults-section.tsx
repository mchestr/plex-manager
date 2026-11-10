"use client"

import {
  CheckboxField,
  daysText,
  NumberInputField,
  rangeError,
  type SectionCheck,
  useCleanupSettingsForm,
} from "@/components/admin/cleanup/settings/section-parts"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"

/** UX 8.8. */
const DEFAULTS_WORDS = {
  title: "Defaults for new rules",
  description: "Recipes and blank rules start with these values. A rule can change them.",
  exclusion: "Add an import list exclusion",
  exclusionHint: "For delete actions only. Import lists do not download the title again.",
} as const

interface DefaultsValues {
  graceDays: number | null
  importListExclusion: boolean
}

/** The action input of valid values, else their errors. @internal Tests check the range. */
export function checkDefaults(values: DefaultsValues): SectionCheck {
  const grace = rangeError(values.graceDays, 1, 3650, "days")
  if (grace || values.graceDays === null) return { errors: { graceDays: grace } }
  return { input: { section: "cleanup-defaults", values: { graceDays: values.graceDays, importListExclusion: values.importListExclusion } } }
}

/**
 * The Defaults for new rules section (UX 4.10, 8.8): the grace period and
 * the import list exclusion that recipes and blank rules start with.
 */
export function DefaultsSection({ data }: { data: CleanupSettingsData }) {
  const saved = data.options.defaults
  const { values, set, errors, form } = useCleanupSettingsForm<DefaultsValues>(
    { graceDays: saved.graceDays, importListExclusion: saved.importListExclusion },
    checkDefaults
  )
  const row = (key: string) => `settings-cleanup-defaults-summary-${key}`
  return (
    <SettingsSection
      id="cleanup-defaults"
      title={DEFAULTS_WORDS.title}
      description={DEFAULTS_WORDS.description}
      form={form}
      view={
        <SettingsSummary data-testid="settings-cleanup-defaults-summary">
          <SettingsSummaryRow label="Grace period" data-testid={row("grace")}>
            {daysText(saved.graceDays)}
          </SettingsSummaryRow>
          <SettingsSummaryRow label="Import list exclusion" data-testid={row("exclusion")}>
            {saved.importListExclusion ? "On, for delete actions" : "Off"}
          </SettingsSummaryRow>
        </SettingsSummary>
      }
    >
      <NumberInputField
        id="cleanup-defaults-grace"
        label="Grace period"
        value={values.graceDays}
        onValueChange={(graceDays) => set({ graceDays })}
        unit="days"
        hint="From 1 to 3650. Matches stay in Leaving soon this long."
        error={errors.graceDays ?? rangeError(values.graceDays, 1, 3650, "days")}
        changedFrom={values.graceDays === saved.graceDays ? undefined : daysText(saved.graceDays)}
        disabled={form.isPending}
      />
      <CheckboxField
        id="cleanup-defaults-exclusion"
        label={DEFAULTS_WORDS.exclusion}
        hint={DEFAULTS_WORDS.exclusionHint}
        checked={values.importListExclusion}
        onCheckedChange={(importListExclusion) => set({ importListExclusion })}
        disabled={form.isPending}
        changedFrom={values.importListExclusion === saved.importListExclusion ? undefined : saved.importListExclusion}
      />
    </SettingsSection>
  )
}
