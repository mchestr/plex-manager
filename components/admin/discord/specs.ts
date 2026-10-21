/**
 * ChartCard specs for `/admin/discord` (P10.5, UI-24): pure builders from the
 * audit metrics, so the Server Component page hands the client card plain data.
 *
 * Daily series take the window's day keys and fill every missing day with 0,
 * so the x axis is always the whole period in the server zone, even when a
 * metric (link requests) only returns the days that had rows.
 *
 * @module components/admin/discord/specs
 */

import { rankedSpec, type ChartSpec } from "@/components/ui/chart-card/chart-spec"
import type { DailyActivity } from "@/lib/discord/audit/metrics/activity"
import type { CommandStats, ContextMetrics, MediaMarkingBreakdown } from "@/lib/discord/audit/metrics/commands"
import type { ErrorAnalysis, HelpCommandStats, SelectionMenuStats } from "@/lib/discord/audit/metrics/errors"
import type { AccountLinkingMetrics } from "@/lib/discord/audit/metrics/users"

export const COMMAND_TYPE_LABELS: Record<string, string> = {
  CHAT: "Chat",
  MEDIA_MARK: "Media marking",
  CLEAR_CONTEXT: "Clear context",
  SELECTION: "Selection",
  LINK_REQUEST: "Link request",
  HELP: "Help",
}

const MARK_COMMAND_LABELS: Record<string, string> = {
  "!finished": "Finished",
  "!done": "Done",
  "!watched": "Watched",
  "!notinterested": "Not interested",
  "!skip": "Skip",
  "!pass": "Pass",
  "!keep": "Keep forever",
  "!favorite": "Favorite",
  "!fav": "Fav",
  "!rewatch": "Rewatch",
  "!badquality": "Bad quality",
  "!lowquality": "Low quality",
}

/** One value per key, 0 on a day with no row. @internal */
export function valuesByDay<T extends { date: string }>(keys: readonly string[], rows: readonly T[], pick: (row: T) => number): number[] {
  const byDay = new Map(rows.map((row) => [row.date, pick(row)]))
  return keys.map((key) => byDay.get(key) ?? 0)
}

/** Commands per day as successful and failed stacked bars. */
export function dailyCommandsSpec(keys: readonly string[], activity: readonly DailyActivity[]): ChartSpec {
  return {
    kind: "stacked-bar",
    x: { type: "day", keys: [...keys] },
    series: [
      { id: "success", label: "Successful", values: valuesByDay(keys, activity, (day) => day.success) },
      { id: "failed", label: "Failed", values: valuesByDay(keys, activity, (day) => day.failed) },
    ],
    format: "number",
  }
}

/** One series of counts per day. */
function dailyCountSpec(keys: readonly string[], rows: readonly { date: string; count: number }[], label: string): ChartSpec {
  return {
    kind: "bar",
    x: { type: "day", keys: [...keys] },
    series: [{ id: "count", label, values: valuesByDay(keys, rows, (row) => row.count) }],
    format: "number",
  }
}

export const commandUsageSpec = (stats: readonly CommandStats[]): ChartSpec =>
  rankedSpec(
    stats.map((cmd) => ({ label: cmd.commandName, value: cmd.totalCount })),
    { series: "Commands", format: "number", limit: 8 },
  )

export const helpTopicsSpec = (help: HelpCommandStats | null): ChartSpec =>
  rankedSpec(
    (help?.helpByTopic ?? []).map((topic) => ({ label: topic.topic, value: topic.count })),
    { series: "Requests", format: "number", limit: 8 },
  )

export const linkRequestsSpec = (keys: readonly string[], linking: AccountLinkingMetrics | null): ChartSpec =>
  dailyCountSpec(keys, linking?.linkRequestsByDay ?? [], "Link requests")

export const contextClearsSpec = (context: ContextMetrics | null): ChartSpec =>
  rankedSpec(
    (context?.clearsByCommand ?? []).map((row) => ({ label: row.commandName, value: row.count })),
    { series: "Clears", format: "number" },
  )

/** Selections by option, in option order (1 to 5, then the unrecognised ones as "Other"). */
export function selectionSpec(selection: SelectionMenuStats | null): ChartSpec {
  const rows = [...(selection?.selectionsByNumber ?? [])].sort((a, b) => optionRank(a.selection) - optionRank(b.selection))
  return {
    kind: "bar",
    x: { type: "category", labels: rows.map((row) => (optionRank(row.selection) === Infinity ? "Other" : `Option ${row.selection}`)) },
    series: [{ id: "selections", label: "Selections", values: rows.map((row) => row.count) }],
    format: "number",
  }
}

function optionRank(selection: string): number {
  const option = Number(selection)
  return Number.isInteger(option) && option >= 1 && option <= 5 ? option : Infinity
}

export const markingCommandsSpec = (marking: MediaMarkingBreakdown | null): ChartSpec =>
  rankedSpec(
    (marking?.byCommand ?? []).map((row) => ({ label: MARK_COMMAND_LABELS[row.commandName] ?? row.commandName, value: row.count })),
    { series: "Marks", format: "number", limit: 8 },
  )

export const topMarkedSpec = (marking: MediaMarkingBreakdown | null): ChartSpec =>
  rankedSpec(
    (marking?.topMediaMarked ?? []).map((row) => ({ label: row.title, value: row.count })),
    { series: "Times marked", format: "number" },
  )

export const errorsByTypeSpec = (errors: ErrorAnalysis | null): ChartSpec =>
  rankedSpec(
    (errors?.errorsByType ?? []).map((row) => ({ label: COMMAND_TYPE_LABELS[row.commandType] ?? row.commandType, value: row.count })),
    { series: "Errors", format: "number" },
  )

export const errorTrendSpec = (keys: readonly string[], errors: ErrorAnalysis | null): ChartSpec =>
  dailyCountSpec(keys, errors?.errorTrend ?? [], "Errors")
