"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { updateDiscordIntegrationSettings } from "@/actions/discord"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { SavedSecret } from "@/lib/security/saved-secret"

/**
 * The Discord integration config, with the client secret and bot token
 * replaced by `{ last4 }`: both go only to Discord, a fixed destination, so
 * a blank field keeps them (P4.6's exception to SEC-31).
 */
export interface StoredDiscordIntegration {
  isEnabled: boolean
  botEnabled?: boolean | null
  clientId?: string | null
  secrets: { clientSecret: SavedSecret | null; botToken: SavedSecret | null }
  supportChannelId?: string | null
  supportThreadIds?: unknown
  guildId?: string | null
  serverInviteCode?: string | null
  platformName?: string | null
  instructions?: string | null
}

/** "abc123" from "https://discord.gg/abc123", "discord.gg/abc123" or "abc123". */
function parseDiscordInviteCode(input: string): string {
  const trimmed = input.trim()
  return trimmed.match(/discord\.gg\/([a-zA-Z0-9]+)/i)?.[1] ?? trimmed
}

function initialValues(integration: StoredDiscordIntegration | null) {
  const supportThreadIds = Array.isArray(integration?.supportThreadIds)
    ? (integration.supportThreadIds as unknown[]).filter((id): id is string => typeof id === "string").join(", ")
    : ""
  return {
    isEnabled: integration?.isEnabled ?? false,
    botEnabled: integration?.botEnabled ?? false,
    clientId: integration?.clientId ?? "",
    // Blank keeps the stored secret
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

type DiscordValues = ReturnType<typeof initialValues>
type DiscordErrors = Partial<Record<keyof DiscordValues, string>>

/** The Discord form, always open (UI-31): values, dirty state, Discard and Save, and field errors. */
export function useDiscordForm(integration: StoredDiscordIntegration | null) {
  const router = useRouter()
  const toast = useToast()
  const [errors, setErrors] = useState<DiscordErrors>({})
  const settings = useSettingsForm(initialValues(integration), async (values) => {
    const result = await updateDiscordIntegrationSettings({
      ...values,
      clientSecret: values.clientSecret.trim() || undefined,
      botToken: values.botToken.trim() || undefined,
    })
    if (!result.success) {
      const fieldErrors = Object.fromEntries(
        Object.entries(result.fieldErrors ?? {}).flatMap(([field, messages]) => (field in values && messages[0] ? [[field, messages[0]]] : []))
      )
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0) toast.showError(result.error)
      return
    }
    setErrors({})
    toast.showSuccess("Discord settings saved")
    router.refresh()
    return { ...values, clientSecret: "", botToken: "" }
  })

  /** Changes fields and clears their errors. */
  const set = (patch: Partial<DiscordValues>) => {
    settings.set(patch)
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  return { values: settings.values, set, errors, form: settings.form }
}

type DiscordForm = ReturnType<typeof useDiscordForm>

interface DiscordIntegrationFieldsProps {
  integration: StoredDiscordIntegration | null
  state: DiscordForm
}

/**
 * The Discord credentials and support settings as FormFields (UI-13). The
 * two feature switches sit in the section's status rows. The client secret
 * and bot token are SecretInputs in the saved state only: their destination
 * is fixed, so no address change asks for them again.
 */
export function DiscordIntegrationFields({ integration, state }: DiscordIntegrationFieldsProps) {
  const { values, set, errors, form } = state
  const disabled = form.isPending

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField name="discord-client-id" label="Client ID" error={errors.clientId}>
        <Input
          value={values.clientId}
          onValueChange={(clientId) => set({ clientId })}
          placeholder="Discord application client ID"
          required={values.isEnabled}
          disabled={disabled}
          data-testid="settings-discord-client-id"
        />
      </FormField>
      <FormField name="discord-client-secret" label="Client secret" error={errors.clientSecret}>
        <SecretInput
          value={values.clientSecret}
          onValueChange={(clientSecret) => set({ clientSecret })}
          saved={integration?.secrets.clientSecret}
          noun="secret"
          placeholder="Discord application client secret"
          required={values.isEnabled}
          disabled={disabled}
          data-testid="settings-discord-client-secret"
        />
      </FormField>
      <FormField name="discord-bot-token" label="Bot token" optional description="Falls back to DISCORD_BOT_TOKEN when blank." error={errors.botToken}>
        <SecretInput
          value={values.botToken}
          onValueChange={(botToken) => set({ botToken })}
          saved={integration?.secrets.botToken}
          noun="token"
          placeholder="Discord bot token"
          disabled={disabled}
          data-testid="settings-discord-bot-token"
        />
      </FormField>
      <FormField name="discord-guild-id" label="Guild ID" optional error={errors.guildId}>
        <Input value={values.guildId} onValueChange={(guildId) => set({ guildId })} placeholder="Discord server (guild) ID" disabled={disabled} />
      </FormField>
      <FormField name="discord-invite" label="Server invite" optional description="Paste the code or the whole discord.gg link." error={errors.serverInviteCode}>
        <Input
          value={values.serverInviteCode}
          onValueChange={(value) => set({ serverInviteCode: parseDiscordInviteCode(value) })}
          leading={<span className="font-mono text-label">discord.gg/</span>}
          placeholder="abc123"
          disabled={disabled}
        />
      </FormField>
      <FormField name="discord-platform-name" label="Platform name" description="Shown on members' Discord profiles." error={errors.platformName}>
        <Input value={values.platformName} onValueChange={(platformName) => set({ platformName })} disabled={disabled} />
      </FormField>
      <FormField name="discord-support-channel" label="Support channel ID" optional description="The channel the bot watches for support." error={errors.supportChannelId}>
        <Input value={values.supportChannelId} onValueChange={(supportChannelId) => set({ supportChannelId })} disabled={disabled} />
      </FormField>
      <FormField name="discord-support-threads" label="Support thread IDs" optional description="Separate them with commas." error={errors.supportThreadIds}>
        <Input value={values.supportThreadIds} onValueChange={(supportThreadIds) => set({ supportThreadIds })} placeholder="123, 456" disabled={disabled} />
      </FormField>
      <FormField
        name="discord-instructions"
        label="Server notes for onboarding"
        optional
        description="Shown to members in the onboarding guide's Discord step."
        error={errors.instructions}
        className="md:col-span-2"
      >
        <Textarea
          value={values.instructions}
          onChange={(event) => set({ instructions: event.target.value })}
          placeholder="Join our Discord server and mention your username in #support for faster help."
          disabled={disabled}
          className="min-h-[120px]"
        />
      </FormField>
    </div>
  )
}
