"use client"

import type { ReactNode } from "react"

import { DiscordIntegrationFields, useDiscordForm, type StoredDiscordIntegration } from "@/components/admin/settings/discord-integration-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { StatusBadge } from "@/components/ui/status-badge"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { discordStatus, type DiscordState, type ResolvedStatus } from "@/lib/ui/status"

interface DiscordSectionProps {
  integration: StoredDiscordIntegration | null
  linkedCount: number
  portalUrl: string
  /** The saved flags, credentials and bot lease, for the two status rows. */
  state: DiscordState
  /** When `state` was read (ISO), so server and client render the same words. */
  now: string
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

interface StatusRowProps {
  id: "linked-roles" | "support-bot"
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  status: ResolvedStatus
  disabled: boolean
}

/** One feature: a Switch with a stable label, and its own badge from the saved state (5.6). */
function StatusRow({ id, label, description, checked, onCheckedChange, status, disabled }: StatusRowProps) {
  const switchId = `settings-discord-${id}`
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4" data-testid={`settings-discord-${id}-row`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={`${switchId}-hint`} data-testid={`${switchId}-switch`} />
        <div className="flex min-w-0 flex-col">
          <Label htmlFor={switchId}>{label}</Label>
          <span id={`${switchId}-hint`} className="text-label text-muted-foreground">
            {description}
          </span>
        </div>
      </div>
      <span className="flex flex-col gap-0.5 sm:items-end" data-testid={`${switchId}-status`}>
        <StatusBadge tone={status.tone} label={status.label} icon={status.mark && typeof status.mark !== "string" ? status.mark : undefined} />
        {status.sub && <span className="text-caption text-muted-foreground">{status.sub}</span>}
      </span>
    </div>
  )
}

/**
 * The Discord section (5.6, P10.20): two status rows, "Linked roles" and
 * "Support bot", each with its Switch and its own badge, and no section badge.
 * The badges read the saved state; the switches save with the form.
 */
export function DiscordSection({ integration, linkedCount, portalUrl, state, now, footerMeta }: DiscordSectionProps) {
  const discord = useDiscordForm(integration)
  const toast = useToast()
  const rows = discordStatus(state, new Date(now))
  const disabled = discord.form.isPending

  const copyPortal = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      toast.showSuccess("Portal URL copied")
    } catch {
      toast.showError("Could not copy. Select the address and copy it instead.")
    }
  }

  return (
    <SettingsSection
      id="discord"
      title="Discord"
      description="Linked roles for members, and the support bot."
      form={discord.form}
      footerMeta={footerMeta}
    >
      <div className="-my-3 flex flex-col divide-y" data-testid="settings-discord-rows">
        <StatusRow
          id="linked-roles"
          label="Linked roles"
          description="Members link Discord and get a role that shows their Plex access."
          checked={discord.values.isEnabled}
          onCheckedChange={(isEnabled) => discord.set({ isEnabled })}
          status={rows.linkedRoles}
          disabled={disabled}
        />
        <StatusRow
          id="support-bot"
          label="Support bot"
          description="Watches the support channel and answers members."
          checked={discord.values.botEnabled}
          onCheckedChange={(botEnabled) => discord.set({ botEnabled })}
          status={rows.supportBot}
          disabled={disabled}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="settings-discord-portal-url">Portal URL</Label>
          <Input
            id="settings-discord-portal-url"
            value={portalUrl}
            readOnly
            className="font-mono"
            data-testid="settings-discord-portal-url"
            trailing={
              <Button type="button" variant="ghost" size="sm" className="-mr-2 h-7 px-2" onClick={() => void copyPortal()} data-testid="settings-discord-portal-copy">
                Copy
              </Button>
            }
          />
          <span className="text-label text-muted-foreground">Set it as the Linked Roles Verification URL in the Discord developer portal.</span>
        </div>
        <dl className="flex flex-col gap-1.5">
          <dt className="text-label text-muted-foreground">Linked accounts</dt>
          <dd className="text-ui text-foreground tabular-nums">{linkedCount}</dd>
        </dl>
      </div>
      <DiscordIntegrationFields integration={integration} state={discord} />
    </SettingsSection>
  )
}
