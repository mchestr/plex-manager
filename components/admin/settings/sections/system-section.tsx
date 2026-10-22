import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { SettingsSection } from "@/components/ui/settings-section"

interface SystemSectionProps {
  baseUrl: string
  nodeEnv: string
  nodeVersion: string
  databaseProvider: string
  /** `DATABASE_URL` with its credentials masked. */
  databaseUrl: string
  platform: string
  /** "Never", or the last config change, formatted. */
  configUpdated: string
  /** The server time zone form. */
  timeZone: ReactNode
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

/** System information (6.4): base URL, environment, runtime and database, and the server time zone. */
export function SystemSection({ baseUrl, nodeEnv, nodeVersion, databaseProvider, databaseUrl, platform, configUpdated, timeZone }: SystemSectionProps) {
  return (
    <SettingsSection id="system" title="System information" description="Runtime, database and the server time zone.">
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Row label="Base URL">
          <span className="font-mono break-all">{baseUrl}</span>
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
      <div id="server-time-zone" className="scroll-mt-24 border-t pt-6">
        {timeZone}
      </div>
    </SettingsSection>
  )
}
