"use client"

import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { SectionState } from "@/components/admin/cleanup/settings/section-parts"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { StatusBadge } from "@/components/ui/status-badge"
import { type Block, blockLabel } from "@/lib/cleanup/blocks"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"
import { SERVICES } from "@/lib/validations/cleanup-vocabulary"

const row = (key: string) => `settings-cleanup-feature-summary-${key}`

/** The block words of the last run line: no rule name reaches the Settings data. */
const BLOCK_WORDS = { service: (service: keyof typeof SERVICE_NAMES) => SERVICE_NAMES[service], rule: () => "a rule" }

/**
 * The outcome of the last run, in the words of UX 8.7 and X6: "Finished",
 * "Held: new matches wait for your approval", or the safety stop that held
 * it. A run with no outcome has not finished. A code that a newer build
 * wrote shows raw.
 *
 * @internal Tests check each outcome.
 */
export function lastRunOutcome(run: { outcome: string | null; blocks: readonly Block[] }): string {
  switch (run.outcome) {
    case null:
      return "Not finished"
    case "finished":
      return "Finished"
    case "dryRun":
      return "Dry run"
    case "held":
      return "Held: new matches wait for your approval"
    case "blocked":
      return run.blocks[0] ? blockLabel(run.blocks[0], BLOCK_WORDS) : "Safety stop"
    default:
      return blockLabel(run.blocks.find((block) => block.code === run.outcome) ?? { code: run.outcome }, BLOCK_WORDS)
  }
}

/** "Read at 3:07 AM today in 2 m 14 s. All 5 sources answered." (UX 8.8). */
function libraryWords(f: BoundFormat, data: CleanupSettingsData["libraryData"], now: number): string | null {
  if (!data.finishedAt) return null
  const configured = SERVICES.filter((service) => data.sources.some((s) => s.service === service && s.state !== "notConfigured"))
  const failed = configured.filter((service) => data.sources.some((s) => s.service === service && s.state === "failed"))
  const answered =
    failed.length === 0
      ? `All ${configured.length} sources answered.`
      : `${configured.length - failed.length} of ${configured.length} sources answered. ${failed.map((s) => SERVICE_NAMES[s]).join(", ")} did not.`
  const took = data.startedAt ? Math.max(0, Date.parse(data.finishedAt) - Date.parse(data.startedAt)) / 60_000 : null
  const duration = took === null ? "" : ` in ${f.duration(took, "short", { smallestUnit: "second" })}`
  return `Read at ${readTimeText(f, data.finishedAt, now)}${duration}. ${answered}`
}

/** "On since Oct 9, 2026", "Paused since ...", "Off", with the end of a 7-day hold that has not ended. */
function featureWords(f: BoundFormat, feature: CleanupSettingsData["feature"], now: number): string {
  if (!feature.enabled) return "Off"
  const since = feature.pausedAt ?? feature.enabledAt
  const state = feature.pausedAt ? "Paused" : "On"
  const head = since ? `${state} since ${f.date(since)}` : state
  const hold = feature.holdUntil && feature.holdUntil > dayKey(now, f.settings.timeZone) ? `. Nothing is deleted before ${f.dayKey(feature.holdUntil)}.` : ""
  return `${head}${hold}`
}

/** The status `Badge` of the section: On, Off or Paused, with the read time of the library data (UX 4.10). */
export function FeatureState({ data, now }: { data: CleanupSettingsData; now: number }) {
  const f = useFormat()
  const { feature, libraryData } = data
  const badge = !feature.enabled ? (
    <StatusBadge tone="neutral" label="Off" />
  ) : feature.pausedAt ? (
    <StatusBadge tone="warning" label="Paused" icon={icons.paused} />
  ) : (
    <StatusBadge tone="success" label="On" />
  )
  const line = libraryData.finishedAt ? `Read at ${readTimeText(f, libraryData.finishedAt, now)}` : undefined
  return <SectionState badge={badge} line={line} testId="settings-cleanup-feature-state" />
}

/** The read view of the Media cleanup section (UX 4.10, 8.8). */
export function FeatureSummary({ data, now }: { data: CleanupSettingsData; now: number }) {
  const f = useFormat()
  const { schedule, libraryData } = data
  const library = libraryWords(f, libraryData, now)
  return (
    <SettingsSummary data-testid="settings-cleanup-feature-summary">
      <SettingsSummaryRow label="Media cleanup" data-testid={row("enabled")}>
        {featureWords(f, data.feature, now)}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Nightly run" data-testid={row("nightly")}>
        {schedule.nextRunAt ? (
          `${f.time(schedule.nextRunAt)}, server time (${schedule.zone})`
        ) : (
          <NotSet>Not scheduled, because Redis is not set up.</NotSet>
        )}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Library data" data-testid={row("library")}>
        {libraryData.reading ? "Reading the library. This takes 1 to 3 minutes." : (library ?? <NotSet>No library data yet.</NotSet>)}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Tautulli history starts" data-testid={row("history")}>
        {libraryData.historyStart ? `${f.date(libraryData.historyStart)}. "Never played" means since then.` : <NotSet>Unknown</NotSet>}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/** "3 rules, 3 joined, 1 rescued, 0 deleted.", then the outcome unless the run finished. */
function lastRunCounts(f: BoundFormat, run: NonNullable<CleanupSettingsData["lastRun"]>): string {
  const counts = `${f.number(run.rules)} ${run.rules === 1 ? "rule" : "rules"}, ${f.number(run.joined)} joined, ${f.number(run.rescued)} rescued, ` +
    `${f.number(run.deleted)} deleted.`
  return run.outcome === "finished" ? counts : `${counts} ${lastRunOutcome(run)}.`
}

/**
 * "Last run" (UX 4.10, `shots/10-settings.png`): who started it, its time,
 * the rules and counts, and the outcome when it did not finish. "Scheduled,
 * 3:07 AM today. 3 rules, 3 joined, 1 rescued, 0 deleted." The time has the
 * timestamp id that visual tests mask.
 */
export function LastRunLine({ lastRun, now }: { lastRun: CleanupSettingsData["lastRun"]; now: number }) {
  const f = useFormat()
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-ui font-semibold text-foreground">Last run</span>
      <span className="text-label text-muted-foreground" data-testid="admin-cleanup-settings-last-run">
        {lastRun ? (
          <>
            {lastRun.trigger === "scheduled" ? "Scheduled" : "Started by an admin"},{" "}
            <span data-testid="admin-cleanup-settings-last-run-timestamp">{readTimeText(f, lastRun.startedAt, now)}</span>. {lastRunCounts(f, lastRun)}
          </>
        ) : (
          "No run yet."
        )}
      </span>
    </div>
  )
}
