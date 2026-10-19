"use client"

import { setStripeEnabled, updateStripeSettings } from "@/actions/admin/admin-config"
import { getAvailableLibraries } from "@/actions/server-info"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/styled-input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

interface StripeSettingsFormProps {
  /** Master toggle state */
  enabled: boolean
  /** Whether a secret key is already stored (never the value itself) */
  hasSecretKey: boolean
  /** Whether a webhook secret is already stored (never the value itself) */
  hasWebhookSecret: boolean
  /** Configured Stripe price ids */
  priceIds: string[]
  /** Plex library section keys shared with subscribers (empty = all libraries) */
  librarySectionIds: number[]
}

/**
 * Parses a comma/newline separated list of price ids into a clean array.
 * @internal
 */
function parsePriceIds(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

export function StripeSettingsForm({
  enabled,
  hasSecretKey,
  hasWebhookSecret,
  priceIds,
  librarySectionIds,
}: StripeSettingsFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [isSaving, startSaving] = useTransition()
  const [isToggling, startToggling] = useTransition()

  // Secrets are never sent to the client. Empty fields mean "keep existing".
  const [secretKey, setSecretKey] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [priceIdsInput, setPriceIdsInput] = useState(priceIds.join("\n"))
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<number[]>(librarySectionIds)
  const [libraries, setLibraries] = useState<Array<{ id: number; title: string; type: string }>>([])
  const [loadingLibraries, setLoadingLibraries] = useState(true)

  useEffect(() => {
    let cancelled = false
    getAvailableLibraries()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setLibraries(result.data)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLibraries(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const parsedPriceIds = parsePriceIds(priceIdsInput)

  // Determine whether the master toggle can be enabled (FR-3). Consider both
  // already-stored secrets and secrets typed into the (unsaved) form.
  const willHaveSecretKey = hasSecretKey || secretKey.trim().length > 0
  const willHaveWebhookSecret = hasWebhookSecret || webhookSecret.trim().length > 0
  const willHavePriceIds = parsedPriceIds.length > 0

  const missing: string[] = []
  if (!willHaveSecretKey) missing.push("secret key")
  if (!willHaveWebhookSecret) missing.push("webhook secret")
  if (!willHavePriceIds) missing.push("at least one price ID")

  const canEnable = missing.length === 0
  const toggleDisabled = isToggling || (!enabled && !canEnable)

  const toggleLibrary = (id: number, checked: boolean) => {
    setSelectedLibraryIds((prev) =>
      checked ? [...prev, id] : prev.filter((existing) => existing !== id)
    )
  }

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault()

    startSaving(async () => {
      const result = await updateStripeSettings({
        secretKey: secretKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        priceIds: parsedPriceIds,
        librarySectionIds: selectedLibraryIds,
      })

      if (result.success) {
        setSecretKey("")
        setWebhookSecret("")
        toast.showSuccess("Stripe settings saved successfully")
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to save Stripe settings")
      }
    })
  }

  const handleToggle = (next: boolean) => {
    startToggling(async () => {
      const result = await setStripeEnabled(next)

      if (result.success) {
        toast.showSuccess(`Stripe ${next ? "enabled" : "disabled"} successfully`)
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update Stripe status")
      }
    })
  }

  return (
    <div className="space-y-4" data-testid="stripe-settings-form">
      {/* Master toggle */}
      <div className="flex items-center gap-4">
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={toggleDisabled}
          loading={isToggling}
          label={enabled ? "Disable Stripe subscriptions" : "Enable Stripe subscriptions"}
          data-testid="stripe-enabled-toggle"
        />
        <span className="text-sm font-medium text-white">
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {!enabled && !canEnable && (
        <div
          className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg"
          data-testid="stripe-enable-requirements"
        >
          <p className="text-sm text-amber-300">
            Stripe cannot be enabled until it is fully configured. Missing: {missing.join(", ")}.
          </p>
        </div>
      )}

      {/* Credentials + price ids */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Secret Key
            </label>
            <StyledInput
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={hasSecretKey ? "Leave blank to keep current key" : "sk_live_..."}
              disabled={isSaving}
              data-testid="stripe-secret-key-input"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Webhook Signing Secret
            </label>
            <StyledInput
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={hasWebhookSecret ? "Leave blank to keep current secret" : "whsec_..."}
              disabled={isSaving}
              data-testid="stripe-webhook-secret-input"
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Price IDs <span className="text-slate-500 font-normal">(one per line or comma separated)</span>
          </label>
          <StyledInput
            type="text"
            value={priceIdsInput}
            onChange={(e) => setPriceIdsInput(e.target.value)}
            placeholder="price_123, price_456"
            disabled={isSaving}
            data-testid="stripe-price-ids-input"
          />
          <p className="text-xs text-slate-500 mt-1">
            The Stripe price IDs offered on the subscribe page. At least one is required to enable Stripe.
          </p>
        </div>

        <div data-testid="stripe-library-access">
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Subscriber Library Access
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Libraries shared with subscribers when access is granted. Leave all unchecked to share every library.
          </p>
          {loadingLibraries ? (
            <p className="text-sm text-slate-400">Loading libraries...</p>
          ) : libraries.length === 0 ? (
            <p className="text-sm text-slate-500">No Plex libraries available</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {libraries.map((lib) => (
                <label key={lib.id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLibraryIds.includes(lib.id)}
                    onChange={(e) => toggleLibrary(lib.id, e.target.checked)}
                    disabled={isSaving}
                    className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-500"
                    data-testid={`stripe-library-checkbox-${lib.id}`}
                  />
                  <span className="text-sm text-slate-300">
                    {lib.title} <span className="text-slate-400">({lib.type})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving} data-testid="stripe-save-button">
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  )
}
