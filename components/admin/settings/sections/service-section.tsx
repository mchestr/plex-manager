"use client"

import type { ReactNode } from "react"

import { ServerFormFields } from "@/components/admin/settings/server-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SecretSummary, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { secretNoun, useServerForm, type StoredServer } from "@/hooks/admin/use-server-form"
import type { SectionHealth } from "@/lib/settings/connection-status"

const COPY = {
  plex: { title: "Plex server", description: "Sign-in, library access and the Watch on Plex link. Required." },
  tautulli: { title: "Tautulli", description: "Watch history and play statistics. Rewind needs it to count everyone's year." },
  overseerr: { title: "Overseerr", description: "Media requests. Powers Request a title and Watchlist sync." },
} as const

type ServiceType = keyof typeof COPY

interface ServiceSectionProps {
  type: ServiceType
  server: StoredServer | null
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/** The saved service, in the edit form's order: name, local URL, public URL and the secret. */
function ServerSummary({ type, server, onReenter }: { type: ServiceType; server: StoredServer; onReenter: () => void }) {
  const row = (key: string) => `settings-${type}-summary-${key}`
  const noun = secretNoun(type)
  return (
    <SettingsSummary data-testid={`settings-${type}-summary`}>
      <SettingsSummaryRow label="Name" data-testid={row("name")}>
        {server.name}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Local URL" mono data-testid={row("url")}>
        {server.url}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Public URL" mono={Boolean(server.publicUrl)} data-testid={row("public-url")}>
        {server.publicUrl || <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label={noun} data-testid={row("secret")}>
        <SecretSummary saved={server.secret} noun={noun} onReenter={onReenter} reenterTestId={`${row("secret")}-reenter`} />
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * A Media group section: Plex server, Tautulli or Overseerr, with its live
 * health. It shows the saved service until Edit (or Set up, when none is
 * saved); Test connection tries the values in the form, which are the saved
 * ones until they are edited.
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
      notSetUp={!server}
      view={(edit) => server && <ServerSummary type={type} server={server} onReenter={() => edit({ focus: `[data-testid="settings-${type}-secret"]` })} />}
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
