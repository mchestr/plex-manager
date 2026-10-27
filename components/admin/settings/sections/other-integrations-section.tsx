"use client"

import type { ReactNode } from "react"

import { JellyfinLoginToggle } from "@/components/admin/settings/jellyfin-login-toggle"
import { ServerForm } from "@/components/admin/settings/server-form"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { SettingsSection } from "@/components/ui/settings-section"
import { StatusBadge } from "@/components/ui/status-badge"
import { SERVER_LABELS, type StoredServer } from "@/hooks/admin/use-server-form"
import { worstStatus, type SectionHealth } from "@/lib/settings/connection-status"

type OtherService = "sonarr" | "radarr" | "jellyfin"

const DESCRIPTIONS: Record<OtherService, string> = {
  sonarr: "TV library and viewing statistics",
  radarr: "Movie library and viewing statistics",
  jellyfin: "A second media server for members who don't use Plex",
}

const ORDER: OtherService[] = ["sonarr", "radarr", "jellyfin"]

interface OtherIntegrationsSectionProps {
  servers: Record<OtherService, StoredServer | null>
  /** Jellyfin's "sign in with Jellyfin" flag, when Jellyfin is set up. */
  jellyfinLogin: boolean | null
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
 * Other integrations (6.4): Sonarr, Radarr and Jellyfin as one list card.
 * The rows are the view, each with its badge; Edit or Set up opens the
 * service's form in a Sheet, its edit mode. Allow Jellyfin sign-in saves at
 * once, so it stays live in the Jellyfin row rather than in the Sheet. The
 * section takes the worst status among the services set up.
 */
export function OtherIntegrationsSection({ servers, jellyfinLogin, health, footerMeta }: OtherIntegrationsSectionProps) {
  const configured = ORDER.filter((type) => servers[type])
  const checkedAt = configured.map((type) => health[type].checkedAt).find(Boolean) ?? null

  return (
    <SettingsSection
      id="other"
      title="Other integrations"
      description="Optional services. Each opens its own form."
      status={worstStatus(configured.map((type) => health[type].status))}
      checkedAt={checkedAt}
    >
      <ul className="-my-2 flex flex-col divide-y">
        {ORDER.map((type) => {
          const server = servers[type]
          const label = SERVER_LABELS[type]
          return (
            <li key={type} className="flex flex-wrap items-center gap-3 py-3" data-testid={`settings-other-${type}`}>
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
              {type === "jellyfin" && jellyfinLogin !== null && (
                <div className="basis-full">
                  <JellyfinLoginToggle enabledForLogin={jellyfinLogin} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </SettingsSection>
  )
}
