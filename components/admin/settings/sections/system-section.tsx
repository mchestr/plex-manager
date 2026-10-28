"use client"

import type { ReactNode } from "react"

import {
  ServerTimeZoneField,
  ServerTimeZoneSummary,
  useTimeZoneForm,
  type ServerTimeZone,
} from "@/components/admin/settings/server-time-zone-form"
import { Badge } from "@/components/ui/badge"
import { SettingsSection } from "@/components/ui/settings-section"

interface RuntimeFacts {
  baseUrl: string
  /** package.json version, with the short build commit when the image set one. */
  appVersion: string
  nodeEnv: string
  nodeVersion: string
  databaseProvider: string
  /** `DATABASE_URL` with its credentials masked. */
  databaseUrl: string
  platform: string
  /** "Never", or the last config change, formatted. */
  configUpdated: string
}

interface SystemSectionProps extends RuntimeFacts {
  timeZone: ServerTimeZone
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-ui text-foreground" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}

/** What the process and its database report: shown in both modes, never editable. */
function Runtime({ baseUrl, appVersion, nodeEnv, nodeVersion, databaseProvider, databaseUrl, platform, configUpdated }: RuntimeFacts) {
  return (
    <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Row label="Base URL">
        <span className="font-mono break-all">{baseUrl}</span>
      </Row>
      <Row label="App version" testId="settings-app-version">
        <span className="font-mono">{appVersion}</span>
      </Row>
      <Row label="Environment">
        <Badge variant={nodeEnv === "production" ? "success" : "warning"}>{nodeEnv}</Badge>
      </Row>
      <Row label="Node.js version">
        <span className="font-mono" data-visual-mask>
          {nodeVersion}
        </span>
      </Row>
      <Row label="Platform">{platform}</Row>
      <Row label="Database">{databaseProvider}</Row>
      <Row label="Database URL">
        <span className="block truncate font-mono text-label text-muted-foreground">{databaseUrl}</span>
      </Row>
      <Row label="Last config update" testId="settings-config-updated-timestamp">
        {configUpdated}
      </Row>
    </dl>
  )
}

/**
 * The `#server-time-zone` target (Rewind's "Change the server time zone"),
 * around the zone's summary in view mode and its field while editing: one
 * element at a time, so `SettingsLayout` always finds it to reveal the group.
 */
function TimeZoneAnchor({ children }: { children: ReactNode }) {
  return (
    <div id="server-time-zone" className="scroll-mt-24 border-t pt-6">
      {children}
    </div>
  )
}

/**
 * System information (6.4): base URL, environment, runtime and database,
 * which are read only in both modes, and the server time zone, the one
 * setting. It opens read-only on the saved zone; Edit System information
 * (or Rewind's link, which focuses `server-time-zone-select`) swaps in the
 * picker, which saves through the section footer (P10.20).
 */
export function SystemSection({ timeZone, footerMeta, ...runtime }: SystemSectionProps) {
  const zone = useTimeZoneForm(timeZone)
  return (
    <SettingsSection
      id="system"
      title="System information"
      description="You can change only the server time zone here."
      form={zone.form}
      footerMeta={footerMeta}
      live={<Runtime {...runtime} />}
      view={
        <TimeZoneAnchor>
          <ServerTimeZoneSummary timeZone={timeZone} />
        </TimeZoneAnchor>
      }
    >
      <TimeZoneAnchor>
        <ServerTimeZoneField state={zone} />
      </TimeZoneAnchor>
    </SettingsSection>
  )
}
