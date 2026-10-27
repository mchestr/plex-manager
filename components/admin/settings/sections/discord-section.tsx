"use client"

import type { ReactNode } from "react"

import { DiscordIntegrationFields, initialDiscordValues, useDiscordForm, type StoredDiscordIntegration } from "@/components/admin/settings/discord-integration-form"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SecretSummary, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { StatusBadge } from "@/components/ui/status-badge"
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

type DiscordForm = ReturnType<typeof useDiscordForm>
type DiscordStatuses = ReturnType<typeof discordStatus>

/** The two features, each a saved flag with its own status row. */
const FEATURES = [
  {
    id: "linked-roles",
    field: "isEnabled",
    status: "linkedRoles",
    label: "Linked roles",
    description: "Members link Discord and get a role that shows their Plex access.",
  },
  {
    id: "support-bot",
    field: "botEnabled",
    status: "supportBot",
    label: "Support bot",
    description: "Watches the support channel and answers members.",
  },
] as const

interface StatusRowProps {
  id: (typeof FEATURES)[number]["id"]
  label: string
  description: string
  status: ResolvedStatus
  /** Edit mode only: the Checkbox, which saves with the form. */
  control?: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled: boolean }
}

/** One feature: its label and description, a Checkbox while editing, and its own badge from the saved state (5.6). */
function StatusRow({ id, label, description, status, control }: StatusRowProps) {
  const controlId = `settings-discord-${id}`
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4" data-testid={`${controlId}-row`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {control && (
          <Checkbox
            id={controlId}
            checked={control.checked}
            onCheckedChange={control.onCheckedChange}
            disabled={control.disabled}
            aria-describedby={`${controlId}-hint`}
            className="mt-0.5"
            data-testid={`${controlId}-switch`}
          />
        )}
        <div className="flex min-w-0 flex-col">
          {control ? <Label htmlFor={controlId}>{label}</Label> : <span className="text-ui font-medium text-foreground">{label}</span>}
          <span id={`${controlId}-hint`} className="text-label text-muted-foreground">
            {description}
          </span>
        </div>
      </div>
      <span className="flex flex-col gap-0.5 sm:items-end" data-testid={`${controlId}-status`}>
        <StatusBadge tone={status.tone} label={status.label} icon={status.mark && typeof status.mark !== "string" ? status.mark : undefined} />
        {status.sub && <span className="text-caption text-muted-foreground">{status.sub}</span>}
      </span>
    </div>
  )
}

/** Both status rows: badges only in view mode, with the form's Checkboxes while editing. */
function StatusRows({ statuses, discord }: { statuses: DiscordStatuses; discord?: DiscordForm }) {
  return (
    <div className="-my-3 flex flex-col divide-y" data-testid="settings-discord-rows">
      {FEATURES.map(({ id, field, status, label, description }) => (
        <StatusRow
          key={id}
          id={id}
          label={label}
          description={description}
          status={statuses[status]}
          control={
            discord && {
              checked: discord.values[field],
              onCheckedChange: (checked) => discord.set({ [field]: checked }),
              disabled: discord.form.isPending,
            }
          }
        />
      ))}
    </div>
  )
}

interface DiscordSummaryProps {
  integration: StoredDiscordIntegration
  /** A bot token is saved or set in `DISCORD_BOT_TOKEN` (`getDiscordBotStatus`). */
  hasBotToken: boolean
  /** Opens the form on a secret the current encryption key can't read. */
  onReenter: (field: "client-secret" | "bot-token") => void
}

/**
 * The saved integration, in the edit form's order. The secrets show only
 * that they are saved; an unset bot token says when `DISCORD_BOT_TOKEN`
 * stands in for it, as the bot itself falls back to it (`getDiscordBotToken`).
 */
function DiscordSummary({ integration, hasBotToken, onReenter }: DiscordSummaryProps) {
  const saved = initialDiscordValues(integration)
  const row = (key: string) => `settings-discord-summary-${key}`
  return (
    <SettingsSummary data-testid="settings-discord-summary">
      <SettingsSummaryRow label="Client ID" mono={Boolean(saved.clientId)} data-testid={row("client-id")}>
        {saved.clientId || <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Client secret" data-testid={row("client-secret")}>
        <SecretSummary
          saved={integration.secrets.clientSecret}
          noun="client secret"
          onReenter={() => onReenter("client-secret")}
          reenterTestId={`${row("client-secret")}-reenter`}
        />
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Bot token" data-testid={row("bot-token")}>
        <SecretSummary
          saved={integration.secrets.botToken}
          noun="bot token"
          empty={hasBotToken ? "Not set, uses DISCORD_BOT_TOKEN" : undefined}
          onReenter={() => onReenter("bot-token")}
          reenterTestId={`${row("bot-token")}-reenter`}
        />
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Guild ID" mono={Boolean(saved.guildId)} data-testid={row("guild-id")}>
        {saved.guildId || <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Server invite" mono={Boolean(saved.serverInviteCode)} data-testid={row("invite")}>
        {saved.serverInviteCode ? `discord.gg/${saved.serverInviteCode}` : <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Platform name" data-testid={row("platform-name")}>
        {saved.platformName || <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Support channel ID" mono={Boolean(saved.supportChannelId)} data-testid={row("support-channel")}>
        {saved.supportChannelId || <NotSet />}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Support thread IDs" mono={Boolean(saved.supportThreadIds)} data-testid={row("support-threads")}>
        {saved.supportThreadIds || <NotSet>None</NotSet>}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Server notes for onboarding" wide data-testid={row("notes")}>
        {saved.instructions ? <span className="whitespace-pre-line">{saved.instructions}</span> : <NotSet>None</NotSet>}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/** The Portal URL with its Copy button, and the linked accounts: neither is a setting, so both show in either mode. */
function PortalAndLinks({ portalUrl, linkedCount }: { portalUrl: string; linkedCount: number }) {
  const toast = useToast()

  const copyPortal = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      toast.showSuccess("Portal URL copied")
    } catch {
      toast.showError("Could not copy. Select the address and copy it instead.")
    }
  }

  return (
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
  )
}

/**
 * The Discord section (5.6, P10.20): the Portal URL and linked accounts,
 * then two status rows, "Linked roles" and "Support bot", each with its own
 * badge from the saved state, and no section badge. It opens read-only on
 * the saved integration (Set up when none is stored); Edit puts a Checkbox
 * in each row and swaps the summary for the fields. The flags save with the
 * form, not at once (NN/g, "Toggle-switch guidelines"), and the badges
 * follow once the save refreshes the page.
 */
export function DiscordSection({ integration, linkedCount, portalUrl, state, now, footerMeta }: DiscordSectionProps) {
  const discord = useDiscordForm(integration)
  const statuses = discordStatus(state, new Date(now))

  return (
    <SettingsSection
      id="discord"
      title="Discord"
      description="Linked roles for members, and the support bot."
      form={discord.form}
      notSetUp={!integration}
      live={<PortalAndLinks portalUrl={portalUrl} linkedCount={linkedCount} />}
      view={(edit) =>
        integration && (
          <>
            <StatusRows statuses={statuses} />
            <DiscordSummary
              integration={integration}
              hasBotToken={state.hasBotToken}
              onReenter={(field) => edit({ focus: `[data-testid="settings-discord-${field}"]` })}
            />
          </>
        )
      }
      footerMeta={footerMeta}
    >
      <StatusRows statuses={statuses} discord={discord} />
      <DiscordIntegrationFields integration={integration} state={discord} />
    </SettingsSection>
  )
}
