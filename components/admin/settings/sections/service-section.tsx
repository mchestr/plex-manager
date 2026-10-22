"use client"

import type { ReactNode } from "react"

import { ServerFormFields } from "@/components/admin/settings/server-form"
import { SettingsSection } from "@/components/ui/settings-section"
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
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/**
 * A Media group section: Plex server, Tautulli or Overseerr, with its live
 * health. Test connection tries the values in the form.
 */
export function ServiceSection({ type, server, health, footerMeta }: ServiceSectionProps) {
  const { values, set, errors, currentOrigin, test, form } = useServerForm(type, server)

  return (
    <SettingsSection
      id={type}
      title={COPY[type].title}
      description={COPY[type].description}
      status={health.status}
      checkedAt={health.checkedAt}
      onTest={test}
      form={form}
      footerMeta={footerMeta}
    >
      <ServerFormFields
        type={type}
        values={values}
        set={set}
        errors={errors}
        saved={server?.secret}
        currentOrigin={currentOrigin}
        disabled={form.isPending}
      />
    </SettingsSection>
  )
}
