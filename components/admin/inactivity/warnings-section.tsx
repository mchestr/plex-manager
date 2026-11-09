"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { useWarningsForm, WARNINGS_BLOCKED, WarningsFields, type WarningsBlock } from "@/components/admin/inactivity/warnings-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { settingsSection } from "@/lib/admin/routes"
import type { InactivityMail } from "@/lib/data/inactivity"
import type { InactivityWarningSettings } from "@/lib/inactivity/settings"

interface WarningsSectionProps {
  saved: InactivityWarningSettings
  /** The saved days without a play. */
  thresholdDays: number
  mail: InactivityMail
  /** Redis is set up, so the warning email jobs can run. */
  queued: boolean
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

const row = (key: string) => `settings-inactivity-warnings-summary-${key}`

/** "30, 7 and 1". */
function leadList(days: readonly number[]): string {
  return days.length === 1 ? String(days[0]) : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`
}

function WarningsSummary({ saved, mail }: Pick<WarningsSectionProps, "saved" | "mail">) {
  const emailLink = (
    <Link href={settingsSection("email")} className="text-foreground underline underline-offset-3" data-testid={row("mail-link")}>
      Email settings
    </Link>
  )
  return (
    <SettingsSummary data-testid="settings-inactivity-warnings-summary">
      <SettingsSummaryRow label="Warning emails" data-testid={row("enabled")}>
        {saved.warningsEnabled ? "On" : "Off"}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Days before removal" data-testid={row("days")}>
        {leadList(saved.warningDays)}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Mail server" data-testid={row("mail")}>
        {mail.ready ? (
          <>
            Set up: sends as {mail.from}. {emailLink} has the test email.
          </>
        ) : (
          <>
            <NotSet>Not set up.</NotSet> {emailLink}
          </>
        )}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Removal waits for warnings" data-testid={row("gate")}>
        With warning emails on, the run removes a member only after their last warning.
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * The Warning emails card, below Automatic removal: the switch and the days
 * before removal as a summary until Edit, then the form. Warnings can be on
 * while removal is off; the app then sends nothing. While email or Redis is
 * not set up, the form cannot turn them on, and says why.
 */
export function InactivityWarningsSection({ saved, thresholdDays, mail, queued, footerMeta }: WarningsSectionProps) {
  const warnings = useWarningsForm(saved, { thresholdDays })
  const blocked: WarningsBlock | null = !mail.ready ? "email" : !queued ? "queue" : null

  return (
    <SettingsSection
      id="inactivity-warnings"
      title="Warning emails"
      description={
        blocked && !saved.warningsEnabled
          ? `Emails members before the run removes their access. ${WARNINGS_BLOCKED[blocked]}`
          : "Emails members before the run removes their access, so they can play something and keep it."
      }
      form={warnings.form}
      view={<WarningsSummary saved={saved} mail={mail} />}
      footerMeta={footerMeta}
    >
      <WarningsFields state={warnings} thresholdDays={thresholdDays} blocked={blocked} />
    </SettingsSection>
  )
}
