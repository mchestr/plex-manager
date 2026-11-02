"use client"

import { useState, type ReactNode } from "react"

import { saveJudgeSettings } from "@/actions/admin/judge-settings"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label, labelClasses } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { useFormat } from "@/lib/format-context"

const SECTION_ID = "conversation-review"

/** The saved conversation review settings, as `Config` holds them. */
export interface JudgeSettings {
  judgeNightlyEnabled: boolean
  judgeSampleRate: number
  judgeMinTurns: number
  llmDailyCapJudgeUsd: number
}

/** The form's values: the two typed numbers as text, so a half-typed one is not lost. */
interface Values {
  enabled: boolean
  sampleRate: number
  minTurns: string
  budget: string
}

type FieldKey = "sampleRate" | "minTurns" | "budget"

/** The action's field names, for its field errors. */
const ACTION_FIELDS: Record<FieldKey, keyof JudgeSettings> = {
  sampleRate: "judgeSampleRate",
  minTurns: "judgeMinTurns",
  budget: "llmDailyCapJudgeUsd",
}

const MIN_TURNS_ERROR = "Enter a whole number from 1 to 50"
const BUDGET_ERROR = "Enter an amount from 0 to 1000"

/** The fields the action would refuse, with the bounds of `saveJudgeSettings`. */
function invalidFields(values: Values): Partial<Record<FieldKey, string>> {
  const turns = Number(values.minTurns)
  const budget = Number(values.budget)
  return {
    ...(!/^\d+$/.test(values.minTurns.trim()) || turns < 1 || turns > 50 ? { minTurns: MIN_TURNS_ERROR } : {}),
    ...(values.budget.trim() === "" || !Number.isFinite(budget) || budget < 0 || budget > 1000 ? { budget: BUDGET_ERROR } : {}),
  }
}

/** The saved settings: the sweep on or off with its time, the rate, the minimum turns and the budget. */
function JudgeSettingsSummary({ saved }: { saved: JudgeSettings }) {
  const f = useFormat()
  const row = (key: string) => `settings-${SECTION_ID}-summary-${key}`
  const budget = saved.llmDailyCapJudgeUsd
  return (
    <SettingsSummary data-testid={`settings-${SECTION_ID}-summary`}>
      <SettingsSummaryRow label="Nightly review" data-testid={row("nightly")}>
        {saved.judgeNightlyEnabled ? "On, at 03:17 server time" : "Off"}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Sample rate" data-testid={row("sample-rate")}>
        {saved.judgeSampleRate}% of changed conversations a night
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Minimum turns" data-testid={row("min-turns")}>
        {saved.judgeMinTurns === 1 ? "1 admin message" : `${saved.judgeMinTurns} admin messages`}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Daily budget" data-testid={row("budget")}>
        {f.money(budget, "prose")} a day{budget === 0 && ", so no review runs"}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * Conversation review: the LLM judge that reviews admin assistant
 * conversations, on request and in a nightly sweep. Titled for both
 * triggers, not "Nightly review", because its daily budget also bounds
 * manual reviews, and this section is that budget's one editor. The judge's
 * model is on the AI provider section's Conversation review tab.
 *
 * The section opens on a summary. Edit swaps in the sweep's Switch, the
 * sample rate as a 0 to 100% Slider, the minimum turns and the budget, which
 * Save sends through `saveJudgeSettings`. That action answers
 * `UPSTREAM_UNAVAILABLE` after it has saved when the job queue did not take
 * the schedule, so that answer counts as saved: the section closes on the new
 * values and the toast says what is left to do.
 */
export function JudgeNightlySection({ saved, footerMeta }: { saved: JudgeSettings; footerMeta?: ReactNode }) {
  const toast = useToast()
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [error, setError] = useState<string>()

  const initial: Values = {
    enabled: saved.judgeNightlyEnabled,
    sampleRate: saved.judgeSampleRate,
    minTurns: String(saved.judgeMinTurns),
    budget: String(saved.llmDailyCapJudgeUsd),
  }

  const settings = useSettingsForm<Values>(initial, async (values) => {
    const invalid = invalidFields(values)
    setErrors(invalid)
    setError(undefined)
    if (Object.keys(invalid).length > 0) return { ok: false }

    const result = await saveJudgeSettings({
      judgeNightlyEnabled: values.enabled,
      judgeSampleRate: values.sampleRate,
      judgeMinTurns: Number(values.minTurns),
      llmDailyCapJudgeUsd: Number(values.budget),
    })
    if (!result.success) {
      // Saved, but the schedule did not move: the summary shows the new values, the toast what is left to do
      if (result.code === "UPSTREAM_UNAVAILABLE") {
        toast.showError(result.error)
        return { ok: true }
      }
      const fieldErrors = Object.fromEntries(
        (Object.keys(ACTION_FIELDS) as FieldKey[]).flatMap((key) => {
          const message = result.fieldErrors?.[ACTION_FIELDS[key]]?.[0]
          return message ? [[key, message]] : []
        })
      )
      setErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0) setError(result.error)
      return { ok: false }
    }
    toast.showSuccess("Conversation review settings saved")
    return { ok: true }
  })
  const { values, form } = settings

  /** Changes fields and clears their errors. */
  const set = (patch: Partial<Values>) => {
    settings.set(patch)
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  return (
    <SettingsSection
      id={SECTION_ID}
      title="Conversation review"
      description="An LLM judge reviews admin assistant conversations, on request and each night. Its model is on the AI provider's Conversation review tab."
      form={{
        ...form,
        onDiscard: () => {
          form.onDiscard()
          setErrors({})
          setError(undefined)
        },
      }}
      view={<JudgeSettingsSummary saved={saved} />}
      footerMeta={footerMeta}
    >
      <div className="flex flex-col gap-6" data-testid="judge-settings">
        <div className="flex items-start gap-3">
          <Switch
            id="judge-nightly"
            checked={values.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
            disabled={form.isPending}
            aria-describedby="judge-nightly-hint"
            className="mt-0.5"
            data-testid="judge-nightly-toggle"
          />
          <div className="flex flex-col">
            <Label htmlFor="judge-nightly">Review conversations every night</Label>
            <span id="judge-nightly-hint" className="text-label text-muted-foreground">
              At 03:17, server time, for conversations that changed since their last review.
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2" data-testid="judge-sample-rate">
          <div className="flex items-center justify-between gap-3">
            <span id="judge-sample-rate-label" className={labelClasses}>
              Sample rate
            </span>
            <span className="text-ui text-foreground tabular-nums" aria-hidden>
              {values.sampleRate}%
            </span>
          </div>
          <Slider
            aria-labelledby="judge-sample-rate-label"
            min={0}
            max={100}
            step={1}
            value={values.sampleRate}
            onValueChange={(value) => set({ sampleRate: Array.isArray(value) ? value[0] : value })}
            getAriaValueText={(_formatted, value) => `${value}%`}
            disabled={form.isPending}
            data-testid="judge-sample-rate-slider"
          />
          <p className="text-label text-muted-foreground">The sample rate applies to each changed conversation, each night.</p>
          {errors.sampleRate && <p className="text-ui text-destructive">{errors.sampleRate}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField name="judge-min-turns" label="Minimum turns" description="The fewest admin messages a conversation needs before a nightly review." error={errors.minTurns}>
            <Input type="number" min={1} max={50} step={1} value={values.minTurns} onValueChange={(minTurns) => set({ minTurns })} disabled={form.isPending} data-testid="judge-min-turns" />
          </FormField>
          <FormField
            name="judge-daily-budget"
            label="Daily budget (USD)"
            description="Covers manual and nightly reviews. A review already running can finish past it."
            error={errors.budget}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={0.01}
              value={values.budget}
              onValueChange={(budget) => set({ budget })}
              disabled={form.isPending}
              data-testid="judge-daily-budget"
            />
          </FormField>
        </div>
        {error && (
          <p className="text-ui text-destructive" role="alert" data-testid="judge-settings-error">
            {error}
          </p>
        )}
      </div>
    </SettingsSection>
  )
}
