import Link from "next/link"

import { memberCount } from "@/components/admin/inactivity/run-outcome"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { settingsSection } from "@/lib/admin/routes"
import type { InactivityRunRow } from "@/lib/data/inactivity"
import type { InactivityPreview } from "@/lib/data/inactivity-preview"
import { BEFORE_WARNINGS_BLOCKS, inactivityBlockLabel } from "@/lib/inactivity/blocks"
import { MAX_NOTICE_ATTEMPTS } from "@/lib/inactivity/notices"

interface WarningAlertsProps {
  warningsOn: boolean
  removalOn: boolean
  mailReady: boolean
  /** Redis is set up. */
  queued: boolean
  preview: Pick<InactivityPreview, "rows" | "unwarned" | "failedWarnings">
  /** Newest first. */
  runs: InactivityRunRow[]
  /** The newest save of either settings card: a run before it ran with other settings. */
  savedAt: Date | null
}

const warnings = (n: number) => `${n} ${n === 1 ? "warning" : "warnings"}`

/**
 * The newest finished run, when it stopped before its warning step: it ran
 * after the newest settings save, planned no warning and qualified no one.
 * A run that reached the step warns every member past their days without a
 * play, so members with no warning after such a run became eligible after it
 * (an exclusion ended, a subscription lapsed): the next run warns them, and
 * no alert shows. Before a run after the save, a switch-on or a lower
 * threshold has had no run to warn them yet.
 */
function missedRun(runs: InactivityRunRow[], savedAt: Date | null): (InactivityRunRow & { blocked: string }) | null {
  const newest = runs.find((run) => run.finishedAt !== null)
  if (!newest || newest.warned > 0 || newest.qualified > 0 || (savedAt && newest.startedAt <= savedAt)) return null
  const { blocked } = newest
  return blocked !== null && BEFORE_WARNINGS_BLOCKS.has(blocked) ? { ...newest, blocked } : null
}

/**
 * The page alerts of the warning emails: the states in which a removal waits
 * for an email that cannot go out, and a daily run that removes no one
 * while warned members wait. Nothing shows while warnings are off.
 */
export function WarningAlerts({ warningsOn, removalOn, mailReady, queued, preview, runs, savedAt }: WarningAlertsProps) {
  if (!warningsOn) return null
  const newestScheduled = runs.find((run) => run.trigger === "scheduled" && run.finishedAt !== null)
  const overLimit = newestScheduled?.blocked === "over_limit" ? preview.rows.length : 0
  const missed = removalOn && preview.unwarned > 0 ? missedRun(runs, savedAt) : null
  const stuck = preview.failedWarnings.filter((row) => row.stuck)

  return (
    <>
      {!mailReady && (
        <Alert
          tone="destructive"
          title="Warning emails cannot go out"
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={settingsSection("email")} />} data-testid="admin-inactivity-alert-email-link">
              Email settings
            </Button>
          }
          data-testid="admin-inactivity-alert-no-email"
        >
          Email is not set up. No one new is removed until email works.
        </Alert>
      )}
      {!queued && (
        <Alert tone="destructive" title="Warning emails need the job queue" data-testid="admin-inactivity-alert-no-queue">
          Redis is not set up, so no warning email goes out. No one new is removed.
        </Alert>
      )}
      {preview.failedWarnings.length > 0 && (
        <Alert tone="warning" title={`${warnings(preview.failedWarnings.length)} failed`} data-testid="admin-inactivity-alert-failed">
          Their members wait until a run sends them.
          {stuck.length > 0 && (
            <>
              {" "}
              These failed {MAX_NOTICE_ATTEMPTS} times, and no run tries them again:{" "}
              <span className="text-foreground" data-testid="admin-inactivity-alert-failed-stuck">
                {stuck.map((row) => row.name).join(", ")}
              </span>
              .
            </>
          )}
        </Alert>
      )}
      {overLimit > 0 && (
        <Alert tone="warning" title="The daily run removes no one" data-testid="admin-inactivity-alert-over-limit">
          {memberCount(overLimit)} {overLimit === 1 ? "waits" : "wait"} for removal, but more qualify than the safety limit
          allows, so the daily run removes no one. Check the list, then use Run now. After 7 days, their warnings start again.
        </Alert>
      )}
      {missed && (
        <Alert tone="warning" title="The newest run sent no first warnings" data-testid="admin-inactivity-alert-unwarned">
          {memberCount(preview.unwarned)} past the days without a play {preview.unwarned === 1 ? "has" : "have"} no warning
          yet. The newest run stopped before it could warn them: {inactivityBlockLabel(missed.blocked)}. No one new is removed
          until a run warns them.
        </Alert>
      )}
    </>
  )
}
