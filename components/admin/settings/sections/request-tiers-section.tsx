"use client"

import { useState, useTransition, type ReactNode } from "react"

import { runRequestTiersNow, updateRequestTierSettings } from "@/actions/admin/request-tiers"
import { RequestTiersLastRun } from "@/components/admin/settings/sections/request-tiers-last-run"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { RequestTierSettingsData } from "@/lib/data/community-stats"
import { DEFAULT_TIERS, MAX_TIERS } from "@/lib/request-tiers/tiers"

/** The tier table as text, so a half-typed number is not lost. */
interface TierRow {
  overHours: string
  movieLimit: string
  tvLimit: string
  days: string
}

const toRows = (tiers: RequestTierSettingsData["tiers"]): TierRow[] =>
  tiers.map((tier) => ({ overHours: String(tier.overHours), movieLimit: String(tier.movieLimit), tvLimit: String(tier.tvLimit), days: String(tier.days) }))

const COLUMNS: { key: keyof TierRow; label: string }[] = [
  { key: "overHours", label: "Over hours watched" },
  { key: "movieLimit", label: "Movies" },
  { key: "tvLimit", label: "Shows" },
  { key: "days", label: "Per days" },
]

interface Values {
  enabled: boolean
  runHour: string
  rows: TierRow[]
}

/**
 * Request limits: a member's Overseerr quota follows how long they have
 * watched. Each tier applies once a member has watched more than its hours; a
 * limit of 0 is unlimited. Members an admin excluded keep the quota set by hand.
 */
export function RequestTiersSection({ saved, startedLabel, footerMeta }: { saved: RequestTierSettingsData; startedLabel: string | null; footerMeta?: ReactNode }) {
  const toast = useToast()
  const [error, setError] = useState<string>()
  const [running, startRun] = useTransition()

  const settings = useSettingsForm<Values>({ enabled: saved.enabled, runHour: String(saved.runHour), rows: toRows(saved.tiers) }, async (values) => {
    const result = await updateRequestTierSettings({
      enabled: values.enabled,
      runHour: Number(values.runHour),
      tiers: values.rows.map((row) => ({ overHours: Number(row.overHours), movieLimit: Number(row.movieLimit), tvLimit: Number(row.tvLimit), days: Number(row.days) })),
    })
    if (!result.success) {
      setError(Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.error)
      return
    }
    setError(undefined)
    toast.showSuccess("Request limits saved")
  })
  const { values, set, form } = settings

  const setRow = (index: number, patch: Partial<TierRow>) => set({ rows: values.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
  const addTier = () => {
    const last = values.rows[values.rows.length - 1]
    set({ rows: [...values.rows, { overHours: String(Number(last?.overHours ?? 0) + 50), movieLimit: last?.movieLimit ?? "2", tvLimit: last?.tvLimit ?? "1", days: last?.days ?? "7" }] })
  }
  const runNow = () =>
    startRun(async () => {
      const result = await runRequestTiersNow()
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(result.data.queued ? "Request limit sync queued" : "Request limits updated")
    })

  return (
    <SettingsSection
      id="request-tiers"
      title="Request limits"
      description="Sets each member's Overseerr request quota from their all-time watch time in Tautulli. Needs both."
      form={form}
      footerMeta={footerMeta}
    >
      <div className="flex flex-col gap-6" data-testid="request-tiers-settings">
        <div className="flex items-start gap-3">
          <Switch id="request-tiers-enabled" checked={values.enabled} onCheckedChange={(enabled) => set({ enabled })} disabled={form.isPending} data-testid="request-tiers-toggle" />
          <div className="flex flex-col">
            <Label htmlFor="request-tiers-enabled">Sync request limits every day</Label>
            <span className="text-label text-muted-foreground">Overseerr is only called for a member whose quota changes.</span>
          </div>
        </div>
        <FormField name="runHour" label="Run at hour" description="Hour of the day in the server time zone, from 0 to 23." error={undefined}>
          <Input type="number" min="0" max="23" value={values.runHour} onValueChange={(runHour) => set({ runHour })} disabled={form.isPending} className="w-24" data-testid="request-tiers-hour" />
        </FormField>
        <fieldset className="flex flex-col gap-3" disabled={form.isPending}>
          <legend className="mb-1 text-label text-muted-foreground">Tiers. A limit of 0 is unlimited. The first tier starts at 0 hours.</legend>
          <div className="grid grid-cols-[2rem_repeat(4,minmax(0,1fr))] items-end gap-2 text-caption text-muted-foreground max-sm:hidden">
            <span>Tier</span>
            {COLUMNS.map((column) => (
              <span key={column.key}>{column.label}</span>
            ))}
          </div>
          {values.rows.map((row, index) => (
            <div key={index} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[2rem_repeat(4,minmax(0,1fr))]" data-testid={`request-tiers-row-${index + 1}`}>
              <span className="text-ui text-foreground max-sm:col-span-2">Tier {index + 1}</span>
              {COLUMNS.map((column) => (
                <Input
                  key={column.key}
                  type="number"
                  min="0"
                  aria-label={`Tier ${index + 1}, ${column.label.toLowerCase()}`}
                  value={row[column.key]}
                  readOnly={index === 0 && column.key === "overHours"}
                  onValueChange={(value) => setRow(index, { [column.key]: value })}
                  data-testid={`request-tiers-${index + 1}-${column.key}`}
                />
              ))}
            </div>
          ))}
          {error && (
            <p className="text-ui text-destructive" role="alert" data-testid="request-tiers-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addTier} disabled={values.rows.length >= MAX_TIERS} data-testid="request-tiers-add">
              Add tier
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ rows: toRows([...DEFAULT_TIERS]) })} data-testid="request-tiers-reset">
              Use the defaults
            </Button>
            {values.rows.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ rows: values.rows.slice(0, -1) })} data-testid="request-tiers-remove">
                Remove last tier
              </Button>
            )}
          </div>
        </fieldset>
        <div className="flex flex-col gap-3 border-t pt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-h3">Last run</h3>
            <Button type="button" variant="secondary" onClick={runNow} loading={running} loadingLabel="Running" disabled={form.isDirty} data-testid="request-tiers-run">
              Run now
            </Button>
          </div>
          <RequestTiersLastRun run={saved.lastRun} startedLabel={startedLabel} />
        </div>
      </div>
    </SettingsSection>
  )
}
