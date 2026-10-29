"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DEFAULT_AFFILIATE_TIERS, MAX_AFFILIATE_INVITES, MAX_AFFILIATE_TIERS, type AffiliateTier } from "@/lib/affiliates/tiers"

/** A tier as text, so a half-typed number is not lost. */
export interface TierRow {
  overHours: string
  invites: string
}

export const toTierRows = (tiers: readonly AffiliateTier[]): TierRow[] =>
  tiers.map((tier) => ({ overHours: String(tier.overHours), invites: String(tier.invites) }))

interface TierEditorProps {
  rows: TierRow[]
  onChange: (rows: TierRow[]) => void
  disabled: boolean
  error?: string
}

/** The tier table: 1 to 5 rows of "more than N hours" and "invites per 30 days". */
export function TierEditor({ rows, onChange, disabled, error }: TierEditorProps) {
  const setRow = (index: number, patch: Partial<TierRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const addTier = () => {
    const last = rows.at(-1)
    onChange([...rows, { overHours: String((Number(last?.overHours) || 0) + 100), invites: last?.invites ?? "1" }])
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled} data-testid="settings-affiliates-tiers">
      <legend className="mb-1 text-ui font-medium text-foreground">Tiers</legend>
      <p className="text-label text-muted-foreground">
        A member gets the invites of the highest tier their total watch time is more than. Below the first tier, they get 0.
      </p>
      <div className="grid grid-cols-[3rem_repeat(2,minmax(0,1fr))] items-end gap-2 text-caption text-muted-foreground max-sm:hidden">
        <span>Tier</span>
        <span>More than (hours)</span>
        <span>Invites per 30 days</span>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[3rem_repeat(2,minmax(0,1fr))]" data-testid={`settings-affiliates-tier-${index + 1}`}>
          <span className="text-ui text-foreground max-sm:col-span-2">Tier {index + 1}</span>
          <Input
            type="number"
            min="1"
            aria-label={`Tier ${index + 1}, more than this many hours`}
            value={row.overHours}
            onValueChange={(overHours) => setRow(index, { overHours })}
            data-testid={`settings-affiliates-tier-${index + 1}-hours`}
          />
          <Input
            type="number"
            min="1"
            max={String(MAX_AFFILIATE_INVITES)}
            aria-label={`Tier ${index + 1}, invites per 30 days`}
            value={row.invites}
            onValueChange={(invites) => setRow(index, { invites })}
            data-testid={`settings-affiliates-tier-${index + 1}-invites`}
          />
        </div>
      ))}
      {error && (
        <p className="text-ui text-destructive" role="alert" data-testid="settings-affiliates-tiers-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addTier} disabled={rows.length >= MAX_AFFILIATE_TIERS} data-testid="settings-affiliates-tier-add">
          Add tier
        </Button>
        {rows.length > 1 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.slice(0, -1))} data-testid="settings-affiliates-tier-remove">
            Remove last tier
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(toTierRows(DEFAULT_AFFILIATE_TIERS))} data-testid="settings-affiliates-tier-reset">
          Use the defaults
        </Button>
      </div>
    </fieldset>
  )
}
