"use client"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { Button } from "@/components/ui/button"
import { StyledCheckbox } from "@/components/ui/styled-checkbox"
import { StyledInput } from "@/components/ui/styled-input"
import { StyledTextarea } from "@/components/ui/styled-textarea"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface DiscordIntegrationFormProps {
  /**
   * The Discord integration config, with the client secret stripped.
   * `hasClientSecret` indicates a secret is stored (never the value itself) so
   * the form can offer "leave blank to keep current value" without exposing it.
   */
  integration: {
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
    updatedAt?: Date
  } | null
  linkedCount: number
  portalUrl: string
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

export function DiscordIntegrationForm({ integration, linkedCount, portalUrl }: DiscordIntegrationFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Whether a client secret / bot token is already stored (leave-blank-to-keep).
  const hasStoredClientSecret = Boolean(integration?.hasClientSecret)
  const hasStoredBotToken = Boolean(integration?.hasBotToken)

  // Normalize the stored (non-secret) support thread IDs into a comma-separated
  // string for the text input.
  const initialSupportThreadIds = Array.isArray(integration?.supportThreadIds)
    ? (integration.supportThreadIds as unknown[])
        .filter((id): id is string => typeof id === "string")
        .join(", ")
    : ""

  // Secrets (client secret + bot token) are never sent to the client. Empty
  // means "keep existing".
  const initialState = {
    isEnabled: integration?.isEnabled ?? false,
    botEnabled: integration?.botEnabled ?? false,
    clientId: integration?.clientId ?? "",
    clientSecret: "",
    botToken: "",
    supportChannelId: integration?.supportChannelId ?? "",
    supportThreadIds: initialSupportThreadIds,
    guildId: integration?.guildId ?? "",
    serverInviteCode: integration?.serverInviteCode ?? "",
    platformName: integration?.platformName ?? "Plex Wrapped",
    instructions: integration?.instructions ?? "",
  }

  const [formData, setFormData] = useState(initialState)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    startTransition(async () => {
      const result = await updateDiscordIntegrationSettings({
        ...formData,
        // Blank secrets are omitted so the action keeps the stored values.
        clientSecret: formData.clientSecret.trim() || undefined,
        botToken: formData.botToken.trim() || undefined,
      })

      if (result.success) {
        setIsEditing(false)
        toast.showSuccess("Discord settings updated successfully")
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update Discord settings")
      }
    })
  }

  if (!isEditing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-4">
          {integration ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Linked Accounts</div>
                <div className="text-sm text-white">{linkedCount}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Bot Status</div>
                <div className="text-sm text-white">
                  {integration.botEnabled ? (
                    <span className="px-2 py-1 bg-green-500/15 text-green-300 border border-green-500/30 rounded text-xs font-medium">
                      Enabled
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-slate-800/60 text-slate-300 border border-slate-600/70 rounded text-xs font-medium">
                      Disabled
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Portal URL</div>
                <div className="text-xs text-white font-mono truncate" title={portalUrl}>
                  {portalUrl}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">No Discord integration configured</div>
          )}
          {integration?.instructions && (
            <div>
              <div className="text-xs font-medium text-slate-400 mb-1">Instructions</div>
              <p className="text-sm text-slate-300 whitespace-pre-line border border-slate-700 rounded-lg p-3 bg-slate-900/40">
                {integration.instructions}
              </p>
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setIsEditing(true)
          }}
          className="ml-4 whitespace-nowrap"
        >
          Edit
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 p-4 bg-slate-900/30 border border-slate-700 rounded-lg">
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
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Client ID {formData.isEnabled && <span className="text-red-400">*</span>}
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
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Client Secret {formData.isEnabled && !hasStoredClientSecret && <span className="text-red-400">*</span>}
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
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Guild ID <span className="text-slate-500 font-normal">(optional)</span>
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
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Server Invite Code <span className="text-slate-500 font-normal">(optional)</span>
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
          <p className="text-xs text-slate-500 mt-1">
            Paste the invite code or full Discord invite link (e.g., https://discord.gg/axzpDYH6jz)
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Platform Name</label>
          <StyledInput
            type="text"
            value={formData.platformName}
            onChange={(e) => setFormData({ ...formData, platformName: e.target.value })}
            placeholder="Displayed in Discord profile"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Bot Token <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <StyledInput
            type="password"
            value={formData.botToken}
            onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
            placeholder={hasStoredBotToken ? "Leave blank to keep current token" : "Discord bot token"}
            disabled={isPending}
            autoComplete="off"
          />
          <p className="text-xs text-slate-500 mt-1">
            Used by the Discord bot. Falls back to the DISCORD_BOT_TOKEN environment variable when blank.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Support Channel ID <span className="text-slate-500 font-normal">(optional)</span>
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
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Support Thread IDs <span className="text-slate-500 font-normal">(optional)</span>
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
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Server Notes for Onboarding <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-slate-500 mb-2">
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

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsEditing(false)
            setFormData(initialState)
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
