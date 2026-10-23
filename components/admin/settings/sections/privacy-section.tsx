"use client"

import { useState, useTransition } from "react"

import { runRetentionNow } from "@/actions/admin/retention"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/ui/settings-section"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { RetentionStatus } from "@/lib/data/retention"

const HEADINGS = ["Data", "Kept for", "Then", "Last run"]

/**
 * Privacy (P11.14): the retention windows the daily sweep applies, the last
 * run with its count per rule, and an audited "Run now". The windows come
 * from `RETENTION_<NAME>_DAYS`, so they change only with the environment.
 */
export function PrivacySection({ status }: { status: RetentionStatus }) {
  const [lastRun, setLastRun] = useState(status.lastRun)
  const [isPending, startTransition] = useTransition()
  const { showError, showSuccess } = useToast()

  const runNow = () => {
    startTransition(async () => {
      const result = await runRetentionNow()
      if (!result.success) {
        showError(result.error)
        return
      }
      setLastRun({ at: result.data.finishedAt, counts: result.data.counts })
      const total = Object.values(result.data.counts).reduce((sum, count) => sum + count, 0)
      showSuccess(total === 0 ? "Retention sweep finished. Nothing was due." : `Retention sweep finished. ${total} rows removed or cleared.`)
    })
  }

  return (
    <SettingsSection
      id="privacy"
      title="Privacy"
      description="How long personal data is kept. A sweep applies these windows every day at 03:30, server time."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ui text-muted-foreground" data-testid="settings-retention-last-run">
          {lastRun ? (
            <>
              Last run <Time value={lastRun.at} nowLabel="just now" />
            </>
          ) : (
            "Not run yet."
          )}
        </p>
        <Button variant="outline" size="sm" onClick={runNow} loading={isPending} data-testid="settings-retention-run">
          Run now
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table aria-label="Retention windows" className="w-full border-collapse text-ui" data-testid="settings-retention-windows">
          <thead className="border-b">
            <tr>
              {HEADINGS.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={index === 3 ? "h-10 px-4 text-right text-label font-medium text-muted-foreground" : "h-10 px-4 text-left text-label font-medium text-muted-foreground"}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {status.policy.map((row) => (
              <tr key={row.rule} data-testid={`settings-retention-${row.rule}`}>
                <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                <td className="px-4 py-3 whitespace-nowrap">{row.keptFor}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.effect}</td>
                <td className="px-4 py-3 text-right tabular-nums" data-testid={`settings-retention-count-${row.rule}`}>
                  {lastRun ? (lastRun.counts[row.rule] ?? 0) : "None"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  )
}
