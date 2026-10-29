"use client"

import { use, useState } from "react"

import { updateAffiliateSettings } from "@/actions/admin/affiliate-settings"
import { LibraryPicker } from "@/components/admin/invites/library-picker"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { AffiliateSettingsView } from "@/lib/data/affiliate-settings"
import { AFFILIATE_CAP_MAX, affiliateSettingsSchema, type AffiliateSettingsInput } from "@/lib/validations/affiliates"
import type { LibraryListing } from "@/types/invite"

import { ShareCount } from "./share-count"
import { TierEditor, toTierRows, type TierRow } from "./tier-editor"

interface Values {
  enabled: boolean
  rows: TierRow[]
  cap: string
  libraries: string[]
}

type Errors = Partial<Record<"tiers" | "cap" | "libraryIds", string>>

const toValues = (saved: AffiliateSettingsView): Values => ({
  enabled: saved.enabled,
  rows: toTierRows(saved.tiers),
  cap: saved.cap === null ? "" : String(saved.cap),
  libraries: saved.libraryIds.map(String),
})

const CAP_ERROR = `Enter a whole number from 0 to ${AFFILIATE_CAP_MAX}, or leave it empty for no cap`

/** The typed values as the action's input, or the first error of each field. */
function toAffiliateInput(values: Values): { ok: true; input: AffiliateSettingsInput } | { ok: false; errors: Errors } {
  const cap = values.cap.trim() === "" ? null : Number(values.cap)
  const parsed = affiliateSettingsSchema.safeParse({
    enabled: values.enabled,
    tiers: values.rows.map((row) => ({ overHours: Number(row.overHours), invites: Number(row.invites) })),
    cap,
    libraryIds: values.libraries.map(Number),
  })
  if (parsed.success) return { ok: true, input: parsed.data }
  const errors: Errors = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0]
    if (key === "tiers" && !errors.tiers) {
      errors.tiers = issue.code === "custom" ? issue.message : "Each tier needs more than 0 hours and 1 to 10 invites"
    }
    if (key === "cap") errors.cap = CAP_ERROR
    if (key === "libraryIds") errors.libraryIds = issue.message
  }
  return { ok: false, errors }
}

/** The settings behind the section's Edit, saved by its footer. */
export function useAffiliateSettingsForm(saved: AffiliateSettingsView) {
  const toast = useToast()
  const [errors, setErrors] = useState<Errors>({})
  const settings = useSettingsForm<Values>(toValues(saved), async (values) => {
    const typed = toAffiliateInput(values)
    if (!typed.ok) {
      setErrors(typed.errors)
      return { ok: false }
    }
    const result = await updateAffiliateSettings(typed.input)
    if (!result.success) {
      const libraryError = result.fieldErrors?.libraryIds?.[0]
      if (libraryError) setErrors({ libraryIds: libraryError })
      else toast.showError(result.error)
      return { ok: false }
    }
    setErrors({})
    const cancelled = result.data.invitesCancelled
    toast.showSuccess(cancelled > 0 ? `Affiliate settings saved. ${cancelled} open ${cancelled === 1 ? "invite was" : "invites were"} cancelled.` : "Affiliate settings saved")
    return { ok: true }
  })
  return {
    values: settings.values,
    set: (patch: Partial<Values>) => {
      settings.set(patch)
      setErrors({})
    },
    errors,
    form: {
      ...settings.form,
      onDiscard: () => {
        settings.form.onDiscard()
        setErrors({})
      },
    },
  }
}

interface FieldsProps {
  state: ReturnType<typeof useAffiliateSettingsForm>
  libraries: Promise<LibraryListing>
  shareCount: Promise<number | null>
}

/** The switch, the tiers, the server cap and the library list. */
export function AffiliateSettingsFields({ state, libraries, shareCount }: FieldsProps) {
  const { values, set, form, errors } = state
  const listing = use(libraries)
  return (
    <div className="flex flex-col gap-6" data-testid="settings-affiliates-fields">
      <div className="flex items-start gap-3">
        <Switch
          id="affiliates-enabled"
          checked={values.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          disabled={form.isPending}
          aria-describedby="affiliates-enabled-hint"
          className="mt-0.5"
          data-testid="settings-affiliates-switch"
        />
        <div className="flex flex-col">
          <Label htmlFor="affiliates-enabled">Affiliate invites</Label>
          <span id="affiliates-enabled-hint" className="text-label text-muted-foreground">
            Needs a library list, Tautulli and a Plex server. When you turn it off, all open affiliate invites are cancelled.
          </span>
        </div>
      </div>
      <TierEditor rows={values.rows} onChange={(rows) => set({ rows })} disabled={form.isPending} error={errors.tiers} />
      <FormField
        name="settings-affiliates-cap"
        label="Server cap"
        optional
        description={
          <>
            Joins per 30 days from all affiliates, from 0 to {AFFILIATE_CAP_MAX}. Empty means no cap. 0 stops all new affiliate invites.{" "}
            <ShareCount count={shareCount} />
          </>
        }
        error={errors.cap}
      >
        <Input
          type="number"
          min="0"
          max={String(AFFILIATE_CAP_MAX)}
          value={values.cap}
          onValueChange={(cap) => set({ cap })}
          disabled={form.isPending}
          className="w-32"
          data-testid="settings-affiliates-cap-input"
        />
      </FormField>
      <div className="flex flex-col gap-2" data-testid="settings-affiliates-libraries">
        <LibraryPicker
          listing={listing}
          value={values.libraries}
          onChange={(libraries) => set({ libraries: libraries === "all" ? [] : libraries })}
          serverLabel="Plex"
          allowAll={false}
          testIdPrefix="settings-affiliates-library"
          error={errors.libraryIds}
        />
        <p className="text-label text-muted-foreground">Each affiliate invite shares these libraries. Downloads are always off.</p>
      </div>
    </div>
  )
}
