"use client"

import {
  CheckboxField,
  daysText,
  type FieldErrors,
  NumberInputField,
  onOff,
  rangeError,
  type SectionCheck,
  useCleanupSettingsForm,
} from "@/components/admin/cleanup/settings/section-parts"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"

/** UX 8.8. */
const MEMBERS_WORDS = {
  title: "Member options",
  description: "What members see and can do. Turning cleanup off never removes a Keep.",
  keeps: "Members can keep titles",
  keepsHint: "Turning this off stops new Keeps. Current Keeps protect their titles until they end.",
  page: "Show the Leaving soon page and the Home row",
  pageOn: "Shown while a member can see a title in Leaving soon",
  others: "Nothing. Each member sees only their own link to a title.",
} as const

interface MembersValues {
  keepsEnabled: boolean
  keepDays: number | null
  keepLimit: number | null
  pageEnabled: boolean
}

/** The errors of the two numbers (TS 3.3): a Keep lasts 7 to 365 days, at most 1 to 100 Keeps. */
function membersErrors(values: MembersValues): FieldErrors {
  const errors: FieldErrors = { keepDays: rangeError(values.keepDays, 7, 365, "days"), keepLimit: rangeError(values.keepLimit, 1, 100, "Keeps") }
  return Object.fromEntries(Object.entries(errors).filter(([, error]) => error))
}

/** The action input of valid values, else their errors. @internal Tests check each range. */
export function checkMembers(values: MembersValues): SectionCheck {
  const errors = membersErrors(values)
  if (Object.keys(errors).length > 0 || values.keepDays === null || values.keepLimit === null) return { errors }
  return {
    input: {
      section: "cleanup-members",
      values: { keepsEnabled: values.keepsEnabled, keepDays: values.keepDays, keepLimit: values.keepLimit, pageEnabled: values.pageEnabled },
    },
  }
}

/**
 * The Member options section (UX 4.10, 8.8): Keeps, their length and limit,
 * the Leaving soon page and Home row, and what members see about others.
 * Turning Keeps off stops new Keeps only: G1 still protects every current
 * Keep until it ends (TS E30), and the hint says so. A save while a run is
 * in progress toasts the busy words (UX 8.9).
 */
export function MembersSection({ data }: { data: CleanupSettingsData }) {
  const saved = data.options.members
  const { values, set, errors, form } = useCleanupSettingsForm<MembersValues>(saved, checkMembers)
  const live = membersErrors(values)
  const disabled = form.isPending
  const row = (key: string) => `settings-cleanup-members-summary-${key}`
  return (
    <SettingsSection
      id="cleanup-members"
      title={MEMBERS_WORDS.title}
      description={MEMBERS_WORDS.description}
      form={form}
      view={
        <SettingsSummary data-testid="settings-cleanup-members-summary">
          <SettingsSummaryRow label={MEMBERS_WORDS.keeps} data-testid={row("keeps")}>
            {onOff(saved.keepsEnabled)}
          </SettingsSummaryRow>
          <SettingsSummaryRow label="A Keep lasts" data-testid={row("keep-days")}>
            {daysText(saved.keepDays)}
          </SettingsSummaryRow>
          <SettingsSummaryRow label="Most Keeps per member" data-testid={row("keep-limit")}>
            {saved.keepLimit} at a time
          </SettingsSummaryRow>
          <SettingsSummaryRow label="Leaving soon page and Home row" data-testid={row("page")}>
            {saved.pageEnabled ? MEMBERS_WORDS.pageOn : "Off"}
          </SettingsSummaryRow>
          <SettingsSummaryRow label="What members see about others" data-testid={row("others")}>
            {MEMBERS_WORDS.others}
          </SettingsSummaryRow>
        </SettingsSummary>
      }
    >
      <CheckboxField
        id="cleanup-members-keeps"
        label={MEMBERS_WORDS.keeps}
        hint={MEMBERS_WORDS.keepsHint}
        checked={values.keepsEnabled}
        onCheckedChange={(keepsEnabled) => set({ keepsEnabled })}
        disabled={disabled}
        changedFrom={values.keepsEnabled === saved.keepsEnabled ? undefined : saved.keepsEnabled}
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <NumberInputField
          id="cleanup-members-keep-days"
          label="A Keep lasts"
          value={values.keepDays}
          onValueChange={(keepDays) => set({ keepDays })}
          unit="days"
          hint="From 7 to 365."
          error={errors.keepDays ?? live.keepDays}
          changedFrom={values.keepDays === saved.keepDays ? undefined : daysText(saved.keepDays)}
          disabled={disabled}
        />
        <NumberInputField
          id="cleanup-members-keep-limit"
          label="Most Keeps per member"
          value={values.keepLimit}
          onValueChange={(keepLimit) => set({ keepLimit })}
          unit="at a time"
          hint="From 1 to 100."
          error={errors.keepLimit ?? live.keepLimit}
          changedFrom={values.keepLimit === saved.keepLimit ? undefined : `${saved.keepLimit} at a time`}
          disabled={disabled}
        />
      </div>
      <CheckboxField
        id="cleanup-members-page"
        label={MEMBERS_WORDS.page}
        hint="Members see them only while they can see a title in Leaving soon."
        checked={values.pageEnabled}
        onCheckedChange={(pageEnabled) => set({ pageEnabled })}
        disabled={disabled}
        changedFrom={values.pageEnabled === saved.pageEnabled ? undefined : saved.pageEnabled}
      />
    </SettingsSection>
  )
}
