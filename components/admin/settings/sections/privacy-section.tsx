"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import { runRetentionNow } from "@/actions/admin/retention"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/ui/settings-section"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { RetentionStatus } from "@/lib/data/retention"

const HEADINGS = ["Data", "Kept for", "Then", "Last run"]
/** While a queued sweep runs, the page refreshes this often, for at most {@link POLL_FOR_MS}. */
const POLL_EVERY_MS = 5000
const POLL_FOR_MS = 5 * 60 * 1000

type LastRun = RetentionStatus["lastRun"]

const newest = (a: LastRun, b: LastRun): LastRun => (!a ? b : !b ? a : a.at >= b.at ? a : b)
const total = (counts: Record<string, number>) => Object.values(counts).reduce((sum, count) => sum + count, 0)

/**
 * Privacy (P11.14): the retention windows the daily sweep applies, the last
 * run with its count per rule, and an audited "Run now". The windows come
 * from `RETENTION_<NAME>_DAYS`, so they change only with the environment.
 * A queued run (with Redis) refreshes the page until the recorded run changes.
 */
export function PrivacySection({ status }: { status: RetentionStatus }) {
  const router = useRouter()
  const [ranNow, setRanNow] = useState<LastRun>(null)
  // The recorded run's time when a sweep was queued; undefined when none is
  const [queuedFrom, setQueuedFrom] = useState<string | null | undefined>(undefined)
  const [isPending, startTransition] = useTransition()
  const { showError, showSuccess } = useToast()

  const lastRun = newest(status.lastRun, ranNow)
  const waiting = queuedFrom !== undefined && (status.lastRun?.at ?? null) === queuedFrom

  useEffect(() => {
    if (!waiting) return
    const poll = setInterval(() => router.refresh(), POLL_EVERY_MS)
    const stop = setTimeout(() => setQueuedFrom(undefined), POLL_FOR_MS)
    return () => {
      clearInterval(poll)
      clearTimeout(stop)
    }
  }, [waiting, router])

  const runNow = () => {
    startTransition(async () => {
      const result = await runRetentionNow()
      if (!result.success) {
        showError(result.error)
        return
      }
      const run = result.data
      if (run.queued) {
        setQueuedFrom(status.lastRun?.at ?? null)
        showSuccess("Retention sweep queued. The counts update here when it finishes.")
        return
      }
      if (run.partial) {
        showSuccess(`Retention sweep stopped after 20 seconds with ${total(run.counts)} rows removed or cleared. The next run finishes it.`)
        return
      }
      setRanNow({ at: run.finishedAt, counts: run.counts })
      const rows = total(run.counts)
      showSuccess(rows === 0 ? "Retention sweep finished. Nothing was due." : `Retention sweep finished. ${rows} rows removed or cleared.`)
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
          {waiting ? (
            "Sweep queued. The counts update here when it finishes."
          ) : lastRun ? (
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
