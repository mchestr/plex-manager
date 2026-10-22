"use client"

import { ServerFormFields } from "@/components/admin/settings/server-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { useRecheckConnection } from "@/hooks/admin/use-recheck-connection"
import { useServerForm, type StoredServer } from "@/hooks/admin/use-server-form"
import type { SectionHealth } from "@/lib/settings/connection-status"

const COPY = {
  plex: { title: "Plex server", description: "Sign-in, library access and the Watch on Plex link. Required." },
  tautulli: { title: "Tautulli", description: "Watch history and play statistics. Rewind needs it to count everyone's year." },
  overseerr: { title: "Overseerr", description: "Media requests. Powers Request a title and Watchlist sync." },
} as const

interface ServiceSectionProps {
  type: keyof typeof COPY
  server: StoredServer | null
  health: SectionHealth
}

/** A Media group section: Plex server, Tautulli or Overseerr, with its live health. */
export function ServiceSection({ type, server, health }: ServiceSectionProps) {
  const { values, set, form, hasStoredSecret } = useServerForm(type, server)
  const test = useRecheckConnection(type)

  return (
    <SettingsSection
      id={type}
      title={COPY[type].title}
      description={COPY[type].description}
      status={health.status}
      checkedAt={health.checkedAt}
      onTest={server ? test : undefined}
      form={form}
    >
      <ServerFormFields type={type} values={values} set={set} hasStoredSecret={hasStoredSecret} disabled={form.isPending} />
    </SettingsSection>
  )
}
