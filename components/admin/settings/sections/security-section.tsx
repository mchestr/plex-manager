"use client"

import { useState, useTransition } from "react"

import { reencryptStoredSecrets } from "@/actions/admin/encryption"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SettingsSection } from "@/components/ui/settings-section"
import { useToast } from "@/components/ui/toast"
import type { EncryptionStatus } from "@/lib/data/encryption"

/** What each encrypted column is called on this page. */
const FIELD_LABELS: Record<string, string> = {
  "User.plexAuthToken": "Member Plex tokens",
  "PlexServer.token": "Plex server token",
  "JellyfinServer.apiKey": "Jellyfin API key",
  "Tautulli.apiKey": "Tautulli API key",
  "Overseerr.apiKey": "Overseerr API key",
  "Sonarr.apiKey": "Sonarr API key",
  "Radarr.apiKey": "Radarr API key",
  "LLMProvider.apiKey": "AI provider key",
  "LLMUsage.prompt": "AI prompts",
  "LLMUsage.response": "AI replies",
  "DiscordIntegration.clientSecret": "Discord client secret",
  "DiscordIntegration.botToken": "Discord bot token",
  "DiscordConnection.accessToken": "Discord link tokens",
  "DiscordConnection.refreshToken": "Discord link refresh tokens",
  "Config.stripeSecretKey": "Stripe secret key",
  "Config.stripeWebhookSecret": "Stripe webhook secret",
  "Config.rewindSerialKey": "Rewind serial key",
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

interface DryRun {
  plaintext: number
  otherKid: number
  unreadable: number
}

/**
 * Security (P11.1): whether stored secrets are encrypted and under which key,
 * any field the current key cannot read, and "Encrypt stored secrets", which
 * counts first (a dry run) and then rewrites every plaintext value and every
 * value under an older key with the primary key.
 */
export function SecuritySection({ status }: { status: EncryptionStatus }) {
  const [counts, setCounts] = useState<DryRun | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { showError, showSuccess } = useToast()
  const pending = counts ? counts.plaintext + counts.otherKid : 0

  const check = () => {
    startTransition(async () => {
      const result = await reencryptStoredSecrets({ dryRun: true })
      if (!result.success) {
        showError(result.error)
        return
      }
      setCounts(result.data)
      const due = result.data.plaintext + result.data.otherKid
      if (due > 0) setConfirming(true)
      else showSuccess(`Every stored value already uses the key ${result.data.primaryKid}.`)
    })
  }

  const run = async () => {
    const result = await reencryptStoredSecrets({ dryRun: false })
    if (!result.success) return { error: result.error }
    setCounts({ plaintext: 0, otherKid: 0, unreadable: result.data.unreadable })
    showSuccess(`Encrypted ${plural(result.data.rewritten, "stored value", "stored values")} with key ${result.data.primaryKid}.`)
    return {}
  }

  return (
    <SettingsSection
      id="security"
      title="Security"
      description="Service keys, member tokens and AI text are encrypted in the database with the key in ENCRYPTION_KEYS."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1 text-ui" data-testid="settings-security-status">
          {status.configured ? (
            <p className="text-foreground">
              Encryption is on. New values use the key <span className="font-mono">{status.primaryKid}</span>.
            </p>
          ) : (
            <p className="text-foreground">Encryption is off. Stored secrets are saved as plain text until a key is set.</p>
          )}
          <p className="text-muted-foreground" data-testid="settings-security-plaintext">
            {counts === null
              ? "Encrypt stored secrets counts the values not yet under this key before it changes anything."
              : pending === 0
                ? "Every stored value is under this key."
                : `${plural(counts.plaintext, "value is", "values are")} in plain text and ${plural(counts.otherKid, "is", "are")} under an older key.`}
          </p>
        </div>
        {status.configured && (
          <Button variant="outline" size="sm" onClick={check} loading={isPending} data-testid="settings-reencrypt-button">
            Encrypt stored secrets
          </Button>
        )}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Encrypt ${plural(pending, "stored value", "stored values")}?`}
          description={`Each one is rewritten with the key ${status.primaryKid}. Keep any older key in ENCRYPTION_KEYS until this finishes.`}
          confirmLabel="Encrypt"
          pendingLabel="Encrypting"
          action={run}
          confirmTestId="settings-reencrypt-confirm"
        />
      </div>
      {status.unreadable.length > 0 && (
        <Alert tone="warning" title="Some stored secrets can't be read" data-testid="settings-security-unreadable">
          <p>The current encryption key cannot read these. Enter them again in their sections, or set the key they were saved with.</p>
          <ul className="mt-2 list-disc pl-5">
            {status.unreadable.map((field) => (
              <li key={`${field.model}.${field.field}`}>
                {FIELD_LABELS[`${field.model}.${field.field}`] ?? `${field.model}.${field.field}`}
                {field.kid ? ` (key ${field.kid})` : ""}
                {field.rows > 1 ? `, ${field.rows} rows` : ""}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </SettingsSection>
  )
}
