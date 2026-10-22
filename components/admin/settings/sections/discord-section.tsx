"use client"

import { DiscordIntegrationFields, useDiscordForm, type StoredDiscordIntegration } from "@/components/admin/settings/discord-integration-form"
import { SettingsSection } from "@/components/ui/settings-section"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface DiscordSectionProps {
  integration: StoredDiscordIntegration | null
  linkedCount: number
  portalUrl: string
  health: SectionHealth
}

/**
 * The Discord section: its status is the worst of the enabled features
 * (5.6). P10.20 splits it into the "Linked roles" and "Support bot" rows.
 */
export function DiscordSection({ integration, linkedCount, portalUrl, health }: DiscordSectionProps) {
  const { values, set, form } = useDiscordForm(integration)

  return (
    <SettingsSection
      id="discord"
      title="Discord"
      description="Linked roles for members, and the support bot."
      status={health.status}
      checkedAt={health.checkedAt}
      form={form}
    >
      <dl className="grid grid-cols-1 gap-4 text-ui md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-label text-muted-foreground">Linked accounts</dt>
          <dd className="text-foreground tabular-nums">{linkedCount}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-label text-muted-foreground">Portal URL</dt>
          <dd className="truncate font-mono text-label text-foreground" title={portalUrl}>
            {portalUrl}
          </dd>
        </div>
      </dl>
      <DiscordIntegrationFields integration={integration} values={values} set={set} isPending={form.isPending} />
    </SettingsSection>
  )
}
