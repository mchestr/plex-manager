"use client"

import Link from "next/link"
import { useState } from "react"

import { updateInactivityWarnings } from "@/actions/admin/inactivity"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { settingsSection } from "@/lib/admin/routes"
import type { InactivityWarningSettings } from "@/lib/inactivity/settings"
import { MAX_LEAD_DAYS, MAX_WARNING_LEADS, maxWarningLead } from "@/lib/validations/inactivity"

/** "30, 7, 1": the leads as the field shows them. */
const leadsText = (days: readonly number[]): string => days.join(", ")

/**
 * The days in the field, largest first, or why they cannot be saved: whole
 * numbers from 1 to {@link MAX_LEAD_DAYS}, each once, at most
 * {@link MAX_WARNING_LEADS}, and the largest at most half of `thresholdDays`.
 * The action checks the same rules.
 *
 * @internal Tests check each rule.
 */
export function parseLeads(text: string, thresholdDays: number): { days: number[] } | { error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length === 0 || !parts.every((part) => /^\d+$/.test(part))) return { error: "Enter whole numbers of days, such as 30, 7, 1" }
  const days = parts.map(Number).sort((a, b) => b - a)
  if (days.some((day) => day < 1)) return { error: "Each number of days must be 1 or more" }
  if (new Set(days).size !== days.length) return { error: "Use each number of days once" }
  if (days.length > MAX_WARNING_LEADS) return { error: `Enter at most ${MAX_WARNING_LEADS} numbers of days` }
  if (days[0] > MAX_LEAD_DAYS) return { error: `Use at most ${MAX_LEAD_DAYS} days before removal` }
  const most = maxWarningLead(thresholdDays)
  if (days[0] > most) return { error: `Use at most ${most} days, half of the ${thresholdDays} days without a play` }
  return { days }
}

/** The field's hint: the rules of {@link parseLeads}, with the half rule only when it is the tighter one. */
function leadsHint(thresholdDays: number): string {
  const hint = `Up to ${MAX_WARNING_LEADS} numbers from 1 to ${MAX_LEAD_DAYS}, such as 30, 7, 1.`
  const most = maxWarningLead(thresholdDays)
  return most < MAX_LEAD_DAYS ? `${hint} The largest can be at most ${most}, half the days without a play.` : hint
}

/** What warnings need before they can be turned on: email set up, then Redis. */
export type WarningsBlock = "email" | "queue"

/** Why the switch cannot be turned on, as the form and the card say it. */
export const WARNINGS_BLOCKED: Record<WarningsBlock, string> = {
  email: "Email is not set up, so warnings cannot be turned on.",
  queue: "Redis is not set up, so warnings cannot be turned on. They go out through the job queue.",
}

interface WarningsFormOptions {
  /** The saved days without a play: the largest lead is at most half of it. */
  thresholdDays: number
  /** What stops a switch-on now, or null when nothing does. */
  blocked: WarningsBlock | null
}

/**
 * The warning switch and the days before removal: the form behind the
 * Warning emails card's Edit, saved by its footer. A field the server
 * refuses shows the server's reason; Cancel clears it with the edits.
 */
export function useWarningsForm(saved: InactivityWarningSettings, { thresholdDays }: Pick<WarningsFormOptions, "thresholdDays">) {
  const toast = useToast()
  const [errors, setErrors] = useState<{ enabled?: string; days?: string }>({})
  const settings = useSettingsForm({ enabled: saved.warningsEnabled, days: leadsText(saved.warningDays) }, async (values) => {
    const leads = parseLeads(values.days, thresholdDays)
    if ("error" in leads) {
      setErrors({ days: leads.error })
      return { ok: false }
    }
    const result = await updateInactivityWarnings({ warningsEnabled: values.enabled, warningDays: leads.days })
    if (!result.success) {
      const enabled = result.fieldErrors?.warningsEnabled?.[0]
      const days = result.fieldErrors?.warningDays?.[0]
      if (enabled || days) setErrors({ enabled, days })
      else toast.showError(result.error)
      return { ok: false }
    }
    setErrors({})
    toast.showSuccess("Warning email settings saved")
    // Show the days as saved: largest first
    return { ok: true, keep: { enabled: values.enabled, days: leadsText(leads.days) } }
  })
  return {
    values: settings.values,
    /** Changes fields; a changed field drops the server's error for it. */
    set: (patch: Partial<typeof settings.values>) => {
      settings.set(patch)
      setErrors((current) => ({ enabled: "enabled" in patch ? undefined : current.enabled, days: "days" in patch ? undefined : current.days }))
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

/**
 * The fields behind Edit: the switch as a Checkbox, since it saves with
 * Save, and the days. While email or Redis is not set up, the switch cannot
 * be turned on, and its hint says why; one that is on can still be turned off.
 */
export function WarningsFields({ state, thresholdDays, blocked }: { state: ReturnType<typeof useWarningsForm> } & WarningsFormOptions) {
  const { values, set, form, errors } = state
  const locked = blocked !== null && !values.enabled
  const liveDays = parseLeads(values.days, thresholdDays)
  return (
    <div className="flex flex-col gap-6" data-testid="admin-inactivity-warnings-settings">
      <div className="flex items-start gap-3">
        <Checkbox
          id="admin-inactivity-warnings-enabled"
          checked={values.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
          disabled={form.isPending || locked}
          aria-describedby={locked ? "admin-inactivity-warnings-enabled-hint admin-inactivity-warnings-blocked" : "admin-inactivity-warnings-enabled-hint"}
          aria-invalid={errors.enabled ? true : undefined}
          className="mt-0.5"
          data-testid="admin-inactivity-warnings-toggle"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="admin-inactivity-warnings-enabled">Email members before the run removes their access</Label>
          <span id="admin-inactivity-warnings-enabled-hint" className="text-label text-muted-foreground">
            The run then removes a member only after their last warning. A member with no warning yet gets the full time
            first. Turning the emails off lets the next run remove members with no sent warning, so turn automatic removal
            off first to stop removals.
          </span>
          {errors.enabled ? (
            <span className="text-label text-destructive" role="alert" data-testid="admin-inactivity-warnings-error">
              {errors.enabled}
            </span>
          ) : (
            locked && blocked && (
              <span id="admin-inactivity-warnings-blocked" className="text-label text-foreground" data-testid="admin-inactivity-warnings-blocked">
                {WARNINGS_BLOCKED[blocked]}{" "}
                {blocked === "email" && (
                  <Link href={settingsSection("email")} className="underline underline-offset-3" data-testid="admin-inactivity-warnings-blocked-email-link">
                    Set up email
                  </Link>
                )}
              </span>
            )
          )}
        </div>
      </div>
      <FormField
        name="inactivity-warning-days"
        label="Days before removal"
        description={leadsHint(thresholdDays)}
        error={errors.days ?? ("error" in liveDays ? liveDays.error : undefined)}
      >
        <Input
          value={values.days}
          onValueChange={(days) => set({ days })}
          disabled={form.isPending}
          inputMode="numeric"
          className="w-48"
          data-testid="admin-inactivity-warning-days-input"
        />
      </FormField>
    </div>
  )
}
