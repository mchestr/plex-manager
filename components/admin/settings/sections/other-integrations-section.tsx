"use client"

import type { ReactNode } from "react"

import { JellyfinLoginToggle } from "@/components/admin/settings/jellyfin-login-toggle"
import { ServerForm } from "@/components/admin/settings/server-form"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/ui/settings-section"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { StatusBadge } from "@/components/ui/status-badge"
import { SERVER_LABELS, type StoredServer } from "@/hooks/admin/use-server-form"
import { worstStatus, type SectionHealth } from "@/lib/settings/connection-status"

type OtherService = "sonarr" | "radarr" | "jellyfin" | "prometheus"

const DESCRIPTIONS: Record<OtherService, string> = {
  sonarr: "TV library and viewing statistics",
  radarr: "Movie library and viewing statistics",
  jellyfin: "A second media server for members who don't use Plex",
  prometheus: "The 7-day uptime strip on the home page",
}

const ORDER: OtherService[] = ["sonarr", "radarr", "jellyfin", "prometheus"]

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
 * Other integrations (6.4): Sonarr, Radarr, Jellyfin and Prometheus as one
 * list card. Each row shows its badge, and Edit or Set up opens its form in a
 * Sheet. The section takes the worst status among the services set up.
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
              <Sheet>
                <SheetTrigger render={<Button variant="ghost" size="sm" data-testid={`settings-other-${type}-edit`} />}>
                  {server ? "Edit" : "Set up"}
                  <span className="sr-only"> {label}</span>
                </SheetTrigger>
                <SheetContent side="right" className="max-w-[480px]" data-testid={`settings-other-${type}-sheet`}>
                  <SheetHeader>
                    <SheetTitle>{label}</SheetTitle>
                    <SheetDescription>{DESCRIPTIONS[type]}</SheetDescription>
                  </SheetHeader>
                  <ServerForm type={type} server={server} footerMeta={footerMeta} />
                  {type === "jellyfin" && jellyfinLogin !== null && <JellyfinLoginToggle enabledForLogin={jellyfinLogin} />}
                </SheetContent>
              </Sheet>
            </li>
          )
        })}
      </ul>
    </SettingsSection>
  )
}
