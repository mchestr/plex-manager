"use client"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { StyledCheckbox } from "@/components/ui/styled-checkbox"
import { StyledInput } from "@/components/ui/styled-input"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface DiscordIntegrationFormProps {
  integration: {
    isEnabled: boolean
    botEnabled?: boolean | null
    clientId?: string | null
    clientSecret?: string | null
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

  const initialState = {
    isEnabled: integration?.isEnabled ?? false,
    botEnabled: integration?.botEnabled ?? false,
    clientId: integration?.clientId ?? "",
    clientSecret: integration?.clientSecret ?? "",
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
        <button
          onClick={() => {
            setIsEditing(true)
          }}
          className="ml-4 px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-cyan-500/50 text-slate-300 hover:text-white text-xs font-medium rounded transition-all flex items-center whitespace-nowrap"
        >
          Edit
        </button>
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
            Client Secret {formData.isEnabled && <span className="text-red-400">*</span>}
          </label>
          <StyledInput
            type="password"
            value={formData.clientSecret}
            onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
            placeholder="Discord application client secret"
            required={formData.isEnabled}
            disabled={isPending}
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
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Server Notes for Onboarding <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Custom notes displayed to users during the onboarding guide's Discord support step. Use this to provide server-specific instructions or important information.
        </p>
        <textarea
          value={formData.instructions}
          onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
          placeholder="e.g., Join our Discord server and mention your username in #support for faster help..."
          disabled={isPending}
          className="w-full min-h-[120px] bg-slate-900 text-white border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false)
            setFormData(initialState)
          }}
          disabled={isPending}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
