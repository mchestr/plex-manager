"use client"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { StyledCheckbox } from "@/components/ui/styled-checkbox"
import { StyledInput } from "@/components/ui/styled-input"
import { StyledTextarea } from "@/components/ui/styled-textarea"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { useRouter } from "next/navigation"

/**
 * The Discord integration config, with the client secret and bot token
 * stripped. `hasClientSecret` and `hasBotToken` say a secret is stored (never
 * the value itself), so a blank field keeps it.
 */
export interface StoredDiscordIntegration {
  isEnabled: boolean
  botEnabled?: boolean | null
  clientId?: string | null
  hasClientSecret?: boolean
  hasBotToken?: boolean
  supportChannelId?: string | null
  supportThreadIds?: unknown
  guildId?: string | null
  serverInviteCode?: string | null
  platformName?: string | null
  instructions?: string | null
}

/**
 * Parses a Discord invite code from either a full URL or just the code
 * Examples:
 * - https://discord.gg/axzpDYH6jz -> axzpDYH6jz
 * - discord.gg/axzpDYH6jz -> axzpDYH6jz
 * - axzpDYH6jz -> axzpDYH6jz
 */
function parseDiscordInviteCode(input: string): string {
  if (!input) return ""

  const trimmed = input.trim()

  // Match Discord invite URLs (https://discord.gg/CODE or discord.gg/CODE)
  const urlMatch = trimmed.match(/discord\.gg\/([a-zA-Z0-9]+)/i)
  if (urlMatch) {
    return urlMatch[1]
  }

  // If it's already just a code, return as-is
  return trimmed
}

function initialValues(integration: StoredDiscordIntegration | null) {
  // Normalize the stored (non-secret) support thread IDs into a comma-separated string
  const supportThreadIds = Array.isArray(integration?.supportThreadIds)
    ? (integration.supportThreadIds as unknown[]).filter((id): id is string => typeof id === "string").join(", ")
    : ""
  // Secrets (client secret + bot token) are never sent to the client. Empty means "keep existing".
  return {
    isEnabled: integration?.isEnabled ?? false,
    botEnabled: integration?.botEnabled ?? false,
    clientId: integration?.clientId ?? "",
    clientSecret: "",
    botToken: "",
    supportChannelId: integration?.supportChannelId ?? "",
    supportThreadIds,
    guildId: integration?.guildId ?? "",
    serverInviteCode: integration?.serverInviteCode ?? "",
    platformName: integration?.platformName ?? "Plex Wrapped",
    instructions: integration?.instructions ?? "",
  }
}

/** The Discord form, always open (UI-31): values, dirty state, Discard and Save. */
export function useDiscordForm(integration: StoredDiscordIntegration | null) {
  const router = useRouter()
  const toast = useToast()
  return useSettingsForm(initialValues(integration), async (values) => {
    const result = await updateDiscordIntegrationSettings({
      ...values,
      // Blank secrets are omitted so the action keeps the stored values.
      clientSecret: values.clientSecret.trim() || undefined,
      botToken: values.botToken.trim() || undefined,
    })
    if (!result.success) {
      toast.showError(result.error || "Failed to update Discord settings")
      return
    }
    toast.showSuccess("Discord settings saved")
    router.refresh()
    return { ...values, clientSecret: "", botToken: "" }
  })
}

type DiscordForm = ReturnType<typeof useDiscordForm>

interface DiscordIntegrationFieldsProps {
  integration: StoredDiscordIntegration | null
  values: DiscordForm["values"]
  set: DiscordForm["set"]
  isPending: boolean
}

/** The Discord fields: the two feature toggles, credentials and support settings. */
export function DiscordIntegrationFields({ integration, values: formData, set, isPending }: DiscordIntegrationFieldsProps) {
  // Whether a client secret / bot token is already stored (leave-blank-to-keep).
  const hasStoredClientSecret = Boolean(integration?.hasClientSecret)
  const hasStoredBotToken = Boolean(integration?.hasBotToken)
  const setFormData = (next: typeof formData) => set(next)

  return (
    <div className="space-y-4">
      <div className="space-y-4 p-4 border border-border rounded-lg">
        <StyledCheckbox
          id="discord-enabled"
          checked={formData.isEnabled}
          onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
          disabled={isPending}
          label="Enable Discord Linked Roles"
          description="Allow users to link their Discord account and verify Plex access through Discord Linked Roles"
        />
        <StyledCheckbox
          id="discord-bot-enabled"
          checked={formData.botEnabled}
          onChange={(e) => setFormData({ ...formData, botEnabled: e.target.checked })}
          disabled={isPending}
          label="Enable Discord Bot"
          description="Automatically monitor support channels and verify user roles (runs automatically when enabled)"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Client ID {formData.isEnabled && <span className="text-destructive">*</span>}
          </label>
          <StyledInput
            type="text"
            value={formData.clientId}
            onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
            placeholder="Discord application client ID"
            required={formData.isEnabled}
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Client Secret {formData.isEnabled && !hasStoredClientSecret && <span className="text-destructive">*</span>}
          </label>
          <StyledInput
            type="password"
            value={formData.clientSecret}
            onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
            placeholder={hasStoredClientSecret ? "Leave blank to keep current secret" : "Discord application client secret"}
            required={formData.isEnabled && !hasStoredClientSecret}
            disabled={isPending}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Guild ID <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <StyledInput
            type="text"
            value={formData.guildId}
            onChange={(e) => setFormData({ ...formData, guildId: e.target.value })}
            placeholder="Discord server (guild) ID"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Server Invite Code <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <StyledInput
            type="text"
            value={formData.serverInviteCode}
            onChange={(e) => {
              const value = e.target.value
              // Parse Discord invite link if full URL is pasted
              const parsedCode = parseDiscordInviteCode(value)
              setFormData({ ...formData, serverInviteCode: parsedCode })
            }}
            placeholder="Discord invite code or full link (e.g., abc123 or https://discord.gg/abc123)"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Paste the invite code or full Discord invite link (e.g., https://discord.gg/axzpDYH6jz)
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Platform Name</label>
          <StyledInput
            type="text"
            value={formData.platformName}
            onChange={(e) => setFormData({ ...formData, platformName: e.target.value })}
            placeholder="Displayed in Discord profile"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Bot Token <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <StyledInput
            type="password"
            value={formData.botToken}
            onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
            placeholder={hasStoredBotToken ? "Leave blank to keep current token" : "Discord bot token"}
            disabled={isPending}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used by the Discord bot. Falls back to the DISCORD_BOT_TOKEN environment variable when blank.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Support Channel ID <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <StyledInput
            type="text"
            value={formData.supportChannelId}
            onChange={(e) => setFormData({ ...formData, supportChannelId: e.target.value })}
            placeholder="Channel the bot monitors for support"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Support Thread IDs <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <StyledInput
            type="text"
            value={formData.supportThreadIds}
            onChange={(e) => setFormData({ ...formData, supportThreadIds: e.target.value })}
            placeholder="Comma-separated thread IDs (e.g. 123, 456)"
            disabled={isPending}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Server Notes for Onboarding <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Custom notes displayed to users during the onboarding guide's Discord support step. Use this to provide server-specific instructions or important information.
        </p>
        <StyledTextarea
          value={formData.instructions}
          onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
          placeholder="e.g., Join our Discord server and mention your username in #support for faster help..."
          disabled={isPending}
          className="w-full min-h-[120px]"
        />
      </div>
    </div>
  )
}
