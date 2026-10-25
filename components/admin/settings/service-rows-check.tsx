"use client"

import { useId, useState, useTransition } from "react"

import { auditServiceRows } from "@/actions/admin/service-rows"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { DuplicateTable, ServiceTable } from "@/lib/services/duplicate-audit"

type Keeps = Partial<Record<ServiceTable, string>>

function TableChoice({ entry, keep, onKeep }: { entry: DuplicateTable; keep: string | undefined; onKeep: (id: string) => void }) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-2" data-testid={`service-rows-${entry.table}`}>
      <p id={labelId} className="text-ui font-medium text-foreground">
        {entry.table}: {entry.rows.length} active rows
      </p>
      <RadioGroup value={keep ?? null} onValueChange={onKeep} aria-labelledby={labelId}>
        {entry.rows.map((row) => (
          <RadioCard
            key={row.id}
            value={row.id}
            data-testid={`service-rows-keep-${row.id}`}
            trailing={<Badge variant={row.connection === "ok" ? "success" : "warning"}>{row.connection === "ok" ? "Connects" : row.connection}</Badge>}
          >
            <span className="font-mono text-ui text-foreground">{row.host}</span>
            <span className="text-label text-muted-foreground">
              {row.id}, updated <Time value={row.updatedAt} />
              {row.id === entry.todaysPickId && ", read today"}
              {row.id === entry.suggestedKeepId && ", suggested"}
            </span>
          </RadioCard>
        ))}
      </RadioGroup>
    </div>
  )
}

/**
 * "Check service rows" (P11.31): lists the services with more than one active
 * row, then keeps the chosen row for each and deactivates the others, after
 * the admin confirms a database dump was taken.
 */
export function ServiceRowsCheck() {
  const [tables, setTables] = useState<DuplicateTable[] | null>(null)
  const [keeps, setKeeps] = useState<Keeps>({})
  const [dumpTaken, setDumpTaken] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { showError, showSuccess } = useToast()
  const dumpId = useId()

  const check = () => {
    startTransition(async () => {
      const result = await auditServiceRows({})
      if (!result.success) return showError(result.error)
      if (!result.data.applied) {
        setTables(result.data.tables)
        setKeeps(Object.fromEntries(result.data.tables.map((entry) => [entry.table, entry.suggestedKeepId])))
        if (result.data.tables.length === 0) showSuccess("Every service has at most one active row.")
      }
    })
  }

  const apply = async () => {
    const result = await auditServiceRows({ confirm: true, keeps, dumpTaken })
    if (!result.success) return { error: result.error }
    setTables([])
    showSuccess("Each service now has one active row.")
    return {}
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-6" data-testid="settings-service-rows">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ui text-muted-foreground">
          {tables === null || tables.length > 0
            ? "Each service should have one active row. Check service rows lists any with more, and what each one connects to."
            : "Every service has at most one active row."}
        </p>
        <Button variant="outline" size="sm" onClick={check} loading={isPending} data-testid="settings-service-rows-check">
          Check service rows
        </Button>
      </div>
      {tables && tables.length > 0 && (
        <>
          {tables.map((entry) => (
            <TableChoice key={entry.table} entry={entry} keep={keeps[entry.table]} onKeep={(id) => setKeeps({ ...keeps, [entry.table]: id })} />
          ))}
          <label htmlFor={dumpId} className="flex items-center gap-2 text-ui text-foreground">
            <Checkbox id={dumpId} checked={dumpTaken} onCheckedChange={setDumpTaken} data-testid="settings-service-rows-dump" />
            I took a database dump just now (pg_dump -Fc).
          </label>
          <div>
            <Button size="sm" disabled={!dumpTaken} onClick={() => setConfirming(true)} data-testid="settings-service-rows-apply">
              Keep the chosen rows
            </Button>
          </div>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Deactivate the other rows?"
            description="The rows you did not choose stop being used. They stay in the database and the audit log records their ids."
            confirmLabel="Deactivate"
            pendingLabel="Deactivating"
            tone="destructive"
            action={apply}
            confirmTestId="settings-service-rows-confirm"
          />
        </>
      )}
    </div>
  )
}
