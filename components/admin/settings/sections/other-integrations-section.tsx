"use client"

import type { ReactNode } from "react"

import { ServerForm } from "@/components/admin/settings/server-form"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { SettingsSection } from "@/components/ui/settings-section"
import { StatusBadge } from "@/components/ui/status-badge"
import { SERVER_LABELS, type StoredServer } from "@/hooks/admin/use-server-form"
import { worstStatus, type SectionHealth } from "@/lib/settings/connection-status"

type OtherService = "sonarr" | "radarr"

const DESCRIPTIONS: Record<OtherService, string> = {
  sonarr: "TV library",
  radarr: "Movie library",
}

const ORDER: OtherService[] = ["sonarr", "radarr"]

interface OtherIntegrationsSectionProps {
  servers: Record<OtherService, StoredServer | null>
  health: Record<OtherService, SectionHealth>
  /** "Last saved ... by ..." from the audit log, shown in each Sheet's footer. */
  footerMeta?: ReactNode
}

/** The host and port of a saved URL, or the service's description. */
function rowDescription(type: OtherService, server: StoredServer | null) {
  if (!server) return DESCRIPTIONS[type]
  try {
    return new URL(server.url).host
  } catch {
    return DESCRIPTIONS[type]
  }
}

/**
 * Sonarr and Radarr (6.4), in the Connections group as one list card. The
 * rows are the view, each with its badge; Edit or Set up opens the service's
 * form in a Sheet, its edit mode. The section takes the worst status among
 * the services set up.
 */
export function OtherIntegrationsSection({ servers, health, footerMeta }: OtherIntegrationsSectionProps) {
  const configured = ORDER.filter((type) => servers[type])
  const checkedAt = configured.map((type) => health[type].checkedAt).find(Boolean) ?? null

  return (
    <SettingsSection
      id="other"
      title="Sonarr, Radarr"
      status={worstStatus(configured.map((type) => health[type].status))}
      checkedAt={checkedAt}
    >
      <ul className="-my-2 flex flex-col divide-y">
        {ORDER.map((type) => {
          const server = servers[type]
          const label = SERVER_LABELS[type]
          return (
            // The row's id is the anchor the overview's Services tile links to
            <li key={type} id={type} className="flex scroll-mt-24 flex-wrap items-center gap-3 py-3" data-testid={`settings-other-${type}`}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-ui font-medium text-foreground">{label}</span>
                <span className={server ? "truncate font-mono text-label text-muted-foreground" : "text-label text-muted-foreground"}>
                  {rowDescription(type, server)}
                </span>
              </div>
              <StatusBadge domain="connection" value={health[type].status} />
              <SettingsSheet
                section="other"
                id={type}
                name={label}
                title={label}
                description={DESCRIPTIONS[type]}
                trigger={server ? "Edit" : "Set up"}
                triggerLabel={label}
                triggerTestId={`settings-other-${type}-edit`}
                sheetTestId={`settings-other-${type}-sheet`}
              >
                {(sheet) => (
                  <ServerForm
                    type={type}
                    server={server}
                    footerMeta={footerMeta}
                    onDone={sheet.onDone}
                    onCancel={sheet.onCancel}
                    onDirtyChange={sheet.onDirtyChange}
                    onPendingChange={sheet.onPendingChange}
                  />
                )}
              </SettingsSheet>
            </li>
          )
        })}
      </ul>
    </SettingsSection>
  )
}
