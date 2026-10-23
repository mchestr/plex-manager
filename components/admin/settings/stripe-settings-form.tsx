"use client"

import { Suspense, use, useState, useTransition } from "react"

import { setStripeEnabled, updateStripeSettings } from "@/actions/admin/admin-config"
import type { StripeConfigStatus } from "@/types/admin"
import { Alert } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Label } from "@/components/ui/label"
import { SecretInput } from "@/components/ui/secret-input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { LibraryListing } from "@/types/invite"

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
    // The action revalidates the page, so the saved state follows
    setErrors({})
    toast.showSuccess("Stripe settings saved")
    return { ...values, secretKey: "", webhookSecret: "" }
  })

  const set = (patch: Partial<typeof initial>) => {
    settings.set(patch)
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  return { values: settings.values, set, errors, form: settings.form }
}

interface JellyfinMembers {
  count: number
  names: string[]
}

/** "Ana, Ben and 2 more sign in with Jellyfin only ..." */
function jellyfinConfirmCopy({ count, names }: JellyfinMembers): string {
  const more = count - names.length
  const who = more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ")
  return `${who} sign in with Jellyfin only and aren't exempt. Their accounts were made in Jellyfin, not through an invite, so mark anyone who should keep free access exempt first.`
}

/**
 * Turning subscriptions on with Jellyfin-only members who are not exempt
 * (P11.11): the action lists them first, and this confirms.
 */
function JellyfinMembersConfirm({ members, onClose }: { members: JellyfinMembers | null; onClose: () => void }) {
  const toast = useToast()
  const count = members?.count ?? 0
  const enable = async () => {
    const result = await setStripeEnabled({ enabled: true, confirmJellyfinMembers: true })
    if (!result.success) return { error: result.error }
    toast.showSuccess("Subscriptions turned on")
    return {}
  }
  return (
    <ConfirmDialog
      open={members !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`${count} Jellyfin ${count === 1 ? "member" : "members"} will be asked to subscribe`}
      description={members ? jellyfinConfirmCopy(members) : ""}
      confirmLabel="Turn on subscriptions"
      pendingLabel="Turning on"
      action={enable}
      data-testid="stripe-enable-jellyfin-confirm"
      confirmTestId="stripe-enable-jellyfin-confirm-button"
    />
  )
}

/** The master switch: it saves on its own, and stays off until every prerequisite is saved. */
function SubscriptionsSwitch({ config, missing }: { config: StripeConfigStatus; missing: string[] }) {
  const toast = useToast()
  const [isToggling, startToggling] = useTransition()
  const [jellyfinMembers, setJellyfinMembers] = useState<JellyfinMembers | null>(null)

  const toggle = (next: boolean) =>
    startToggling(async () => {
      const result = await setStripeEnabled(next)
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      if (result.data.status === "confirm") {
        setJellyfinMembers(result.data.jellyfinMembers)
        return
      }
      // The action revalidates the page, so the switch follows the stored value
      toast.showSuccess(next ? "Subscriptions turned on" : "Subscriptions turned off")
    })

  return (
    <div className="flex items-start gap-3">
      <JellyfinMembersConfirm members={jellyfinMembers} onClose={() => setJellyfinMembers(null)} />
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
  /** The Plex libraries, started by the page and read inside Suspense. */
  libraries: Promise<LibraryListing>
}

interface LibraryChecklistProps {
  libraries: Promise<LibraryListing>
  selected: number[]
  onToggle: (id: number, checked: boolean) => void
  disabled: boolean
}

/** The subscriber library checkboxes, once the page's Plex listing arrives. */
function LibraryChecklist({ libraries, selected, onToggle, disabled }: LibraryChecklistProps) {
  const listing = use(libraries)
  if (!listing.ok || listing.libraries.length === 0) {
    return <p className="text-label text-muted-foreground">No Plex libraries available</p>
  }
  return (
    <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
      {listing.libraries.map((library) => {
        const id = Number(library.id)
        return (
          <label key={library.id} className="flex cursor-pointer items-center gap-2 text-ui text-foreground">
            <Checkbox
              checked={selected.includes(id)}
              onCheckedChange={(checked) => onToggle(id, checked)}
              disabled={disabled}
              data-testid={`stripe-library-checkbox-${library.id}`}
            />
            <span>
              {library.name} <span className="text-muted-foreground">({library.type})</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/**
 * Stripe's switch, its one prerequisite Alert (`stripe-enable-requirements`)
 * and the fields. The keys are SecretInputs in the saved state.
 */
export function StripeSettingsFields({ config, state, libraries }: StripeSettingsFieldsProps) {
  const { values, set, errors, form } = state
  const missing = missingStripeSetup(config)
  const disabled = form.isPending

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
        <Suspense fallback={<p className="text-label text-muted-foreground">Loading libraries</p>}>
          <LibraryChecklist libraries={libraries} selected={values.librarySectionIds} onToggle={toggleLibrary} disabled={disabled} />
        </Suspense>
      </fieldset>
    </div>
  )
}
