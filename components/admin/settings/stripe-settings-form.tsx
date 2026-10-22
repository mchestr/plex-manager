"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import { setStripeEnabled, updateStripeSettings, type StripeConfigStatus } from "@/actions/admin/admin-config"
import { getAvailableLibraries } from "@/actions/server-info"
import { Alert } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Label } from "@/components/ui/label"
import { SecretInput } from "@/components/ui/secret-input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"

/** The comma or newline separated price ids as a clean list. */
function parsePriceIds(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

/**
 * What the Subscriptions switch still waits for (FR-3), from the saved
 * settings only: `setStripeEnabled` refuses on the same list.
 */
function missingStripeSetup(config: StripeConfigStatus): string[] {
  const missing: string[] = []
  if (!config.hasSecretKey) missing.push("a secret key")
  if (!config.hasWebhookSecret) missing.push("a webhook signing secret")
  if (config.priceIds.length === 0) missing.push("at least one price ID")
  if (!config.hasJobQueue) missing.push("the job queue (REDIS_URL)")
  return missing
}

type StripeField = "secretKey" | "webhookSecret" | "priceIds" | "librarySectionIds"

/**
 * The Stripe keys, price ids and subscriber libraries as one always-open
 * form (UI-31) saved by the section footer. Blank keys keep the stored ones:
 * both go only to Stripe, so they never ask for re-entry. Errors appear only
 * after a save attempt.
 */
export function useStripeForm(config: StripeConfigStatus) {
  const router = useRouter()
  const toast = useToast()
  const [errors, setErrors] = useState<Partial<Record<StripeField, string>>>({})
  const initial = {
    secretKey: "",
    webhookSecret: "",
    priceIds: config.priceIds.join("\n"),
    librarySectionIds: config.librarySectionIds,
  }

  const settings = useSettingsForm(initial, async (values) => {
    const result = await updateStripeSettings({
      secretKey: values.secretKey.trim() || undefined,
      webhookSecret: values.webhookSecret.trim() || undefined,
      priceIds: parsePriceIds(values.priceIds),
      librarySectionIds: values.librarySectionIds,
    })
    if (!result.success) {
      const fieldErrors: Partial<Record<StripeField, string>> = {}
      for (const field of ["secretKey", "webhookSecret", "priceIds", "librarySectionIds"] as const) {
        const message = result.fieldErrors?.[field]?.[0]
        if (message) fieldErrors[field] = message
      }
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0) toast.showError(result.error)
      return
    }
    setErrors({})
    toast.showSuccess("Stripe settings saved")
    router.refresh()
    return { ...values, secretKey: "", webhookSecret: "" }
  })

  const set = (patch: Partial<typeof initial>) => {
    settings.set(patch)
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  return { values: settings.values, set, errors, form: settings.form }
}

/** The master switch: it saves on its own, and stays off until every prerequisite is saved. */
function SubscriptionsSwitch({ config, missing }: { config: StripeConfigStatus; missing: string[] }) {
  const router = useRouter()
  const toast = useToast()
  const [isToggling, startToggling] = useTransition()

  const toggle = (next: boolean) =>
    startToggling(async () => {
      const result = await setStripeEnabled(next)
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      toast.showSuccess(next ? "Subscriptions turned on" : "Subscriptions turned off")
      router.refresh()
    })

  return (
    <div className="flex items-start gap-3">
      <Switch
        id="stripe-enabled"
        checked={config.enabled}
        onCheckedChange={toggle}
        disabled={isToggling || (!config.enabled && missing.length > 0)}
        loading={isToggling}
        aria-describedby="stripe-enabled-hint"
        data-testid="stripe-enabled-toggle"
      />
      <div className="flex flex-col">
        <Label htmlFor="stripe-enabled">Subscriptions</Label>
        <span id="stripe-enabled-hint" className="text-label text-muted-foreground">
          Non-members can subscribe for access. Turning it off cancels nothing.
        </span>
      </div>
    </div>
  )
}

interface StripeSettingsFieldsProps {
  config: StripeConfigStatus
  state: ReturnType<typeof useStripeForm>
}

/**
 * Stripe's switch, its one prerequisite Alert (`stripe-enable-requirements`)
 * and the fields. The keys are SecretInputs in the saved state.
 */
export function StripeSettingsFields({ config, state }: StripeSettingsFieldsProps) {
  const { values, set, errors, form } = state
  const missing = missingStripeSetup(config)
  const [libraries, setLibraries] = useState<Array<{ id: number; title: string; type: string }> | null>(null)
  const disabled = form.isPending

  useEffect(() => {
    let cancelled = false
    getAvailableLibraries().then((result) => {
      if (!cancelled) setLibraries(result.success && result.data ? result.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleLibrary = (id: number, checked: boolean) =>
    set({ librarySectionIds: checked ? [...values.librarySectionIds, id] : values.librarySectionIds.filter((existing) => existing !== id) })

  return (
    <div className="flex flex-col gap-6" data-testid="stripe-settings-form">
      <SubscriptionsSwitch config={config} missing={missing} />
      {!config.enabled && missing.length > 0 && (
        <Alert tone="warning" role="status" title="Subscriptions can't be turned on yet." data-testid="stripe-enable-requirements">
          Save {missing.join(", ")} first.
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField name="stripe-secret-key" label="Secret key" description="Required before subscriptions can be turned on." error={errors.secretKey}>
          <SecretInput
            value={values.secretKey}
            onValueChange={(secretKey) => set({ secretKey })}
            saved={config.saved.secretKey}
            placeholder="sk_live_…"
            disabled={disabled}
            data-testid="stripe-secret-key-input"
          />
        </FormField>
        <FormField
          name="stripe-webhook-secret"
          label="Webhook signing secret"
          description="Required before subscriptions can be turned on. In Stripe, open Developers, then Webhooks."
          error={errors.webhookSecret}
        >
          <SecretInput
            value={values.webhookSecret}
            onValueChange={(webhookSecret) => set({ webhookSecret })}
            saved={config.saved.webhookSecret}
            noun="secret"
            placeholder="whsec_…"
            disabled={disabled}
            data-testid="stripe-webhook-secret-input"
          />
        </FormField>
        <FormField
          name="stripe-price-ids"
          label="Price IDs"
          description="The prices offered on the subscribe page, one per line or separated by commas. At least one is required before subscriptions can be turned on."
          error={errors.priceIds}
          className="md:col-span-2"
        >
          <Textarea
            value={values.priceIds}
            onChange={(event) => set({ priceIds: event.target.value })}
            placeholder="price_123"
            rows={3}
            disabled={disabled}
            className="font-mono"
            data-testid="stripe-price-ids-input"
          />
        </FormField>
      </div>
      <fieldset className="flex flex-col gap-2" data-testid="stripe-library-access">
        <legend className="text-ui font-medium text-foreground">Subscriber library access</legend>
        <p className="text-label text-muted-foreground">Libraries shared with subscribers. Leave all unchecked to share every library.</p>
        {libraries === null ? (
          <p className="text-label text-muted-foreground">Loading libraries</p>
        ) : libraries.length === 0 ? (
          <p className="text-label text-muted-foreground">No Plex libraries available</p>
        ) : (
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
            {libraries.map((library) => (
              <label key={library.id} className="flex cursor-pointer items-center gap-2 text-ui text-foreground">
                <Checkbox
                  checked={values.librarySectionIds.includes(library.id)}
                  onCheckedChange={(checked) => toggleLibrary(library.id, checked)}
                  disabled={disabled}
                  data-testid={`stripe-library-checkbox-${library.id}`}
                />
                <span>
                  {library.title} <span className="text-muted-foreground">({library.type})</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  )
}
