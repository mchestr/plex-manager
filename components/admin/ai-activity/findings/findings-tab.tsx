"use client"

import { ListChecks, SearchX } from "lucide-react"

import { FindingsGroups, type FindingGroup } from "@/components/admin/ai-activity/findings/findings-groups"
import { FindingsTable } from "@/components/admin/ai-activity/findings/findings-table"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Label } from "@/components/ui/label"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { Switch } from "@/components/ui/switch"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { FINDINGS_GROUPED } from "@/lib/admin/routes"
import type { FindingRow } from "@/lib/data/conversation-findings"
import { useFormat } from "@/lib/format-context"
import type { FindingSeverity } from "@/lib/generated/prisma/client"
import type { DayRange } from "@/lib/ui/date-range"
import { FINDING_SEVERITY_LABEL, FINDING_STATUS_LABEL, FINDING_TYPE_LABEL, labelOptions } from "@/lib/ui/finding-labels"

const ALL = { value: "all", label: "All" }
const TYPE_FILTER = { param: "type", label: "Type", options: [ALL, ...labelOptions(FINDING_TYPE_LABEL)] }
const SEVERITY_FILTER = { param: "severity", label: "Severity", options: [ALL, ...labelOptions(FINDING_SEVERITY_LABEL)] }
const STATUS_FILTER = { param: "status", label: "Status", options: [ALL, ...labelOptions(FINDING_STATUS_LABEL)], defaultValue: "open" }

interface FindingsTabProps {
  stats: { open: number; fixed: number; falseAlarmRate: number | null }
  /** The list with its page, or the open backlog by type and tool. */
  view:
    | { mode: "list"; rows: FindingRow[]; total: number; hiddenUnverified: number; hideUnverified: boolean; page: number; pageSize: number }
    | { mode: "groups"; groups: FindingGroup[] }
  /** The severity filter and range, which a group's link keeps. */
  severity?: FindingSeverity
  range: DayRange | null
  /** A filter or range beyond the defaults is set. */
  filtered: boolean
  zone: string
}

/**
 * AI activity's Findings tab (spec §2): Open, Fixed (in range) and False
 * alarm rate, the Calls date range, type, severity and status filters (open
 * by default), Hide unverified with the hidden count, and List or Group by
 * type and tool. Every filter lives in the URL; a group's tool shows as a
 * chip, so the filter a group link sets can be seen and cleared.
 */
export function FindingsTab({ stats, view, severity, range, filtered, zone }: FindingsTabProps) {
  const f = useFormat()
  const { searchParams, replace } = useReplaceParams()
  const grouped = view.mode === "groups"
  const tool = searchParams.get("tool")
  const toolFilter = tool === null ? [] : [{ param: "tool", label: "Tool", options: [ALL, { value: tool, label: tool || "No tool" }] }]
  // Groups count open findings, so the status filter does not apply to them
  const filters = [TYPE_FILTER, SEVERITY_FILTER, ...(grouped ? [] : [STATUS_FILTER]), ...toolFilter]
  const shown = grouped ? view.groups.length : view.total

  const toolbar = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangeFilter zone={zone} data-testid="findings-dates" />
        <SegmentedControl
          aria-label="Show findings as"
          value={grouped ? "groups" : "list"}
          onValueChange={(next) => replace({ group: next === "groups" ? FINDINGS_GROUPED : null, page: null })}
          data-testid="findings-group-toggle"
        >
          <Segment value="list">List</Segment>
          <Segment value="groups">Group by type and tool</Segment>
        </SegmentedControl>
      </div>
      <FilterBar filters={filters} resultCount={{ shown, total: shown, noun: grouped ? "groups" : "findings" }} data-testid="findings-filters" />
      {view.mode === "list" && (
        <div className="flex items-center gap-3">
          <Switch
            id="findings-hide-unverified"
            checked={view.hideUnverified}
            onCheckedChange={(on) => replace({ unverified: on ? null : "show", page: null })}
            data-testid="findings-hide-unverified"
          />
          <Label htmlFor="findings-hide-unverified">Hide unverified ({f.number(view.hiddenUnverified)})</Label>
        </div>
      )}
    </div>
  )

  const empty = filtered ? (
    <EmptyState kind="filtered" icon={SearchX} title="No findings match these filters" description="Clear the filters or select a longer period." data-testid="findings-empty" />
  ) : (
    <EmptyState kind="first-use" icon={ListChecks} title="No open findings" description="Findings show here once the judge reviews assistant conversations." data-testid="findings-empty" />
  )

  return (
    <div className="flex flex-col gap-6">
      <StatGrid data-testid="findings-stats">
        <StatTile label="Open" value={f.number(stats.open)} data-testid="findings-stat-open" />
        <StatTile label="Fixed (in range)" value={f.number(stats.fixed)} data-testid="findings-stat-fixed" />
        <StatTile
          label="False alarm rate"
          value={stats.falseAlarmRate === null ? "—" : f.percent(stats.falseAlarmRate, 1)}
          unit={stats.falseAlarmRate === null ? "nothing triaged" : undefined}
          data-testid="findings-stat-false-alarm"
        />
      </StatGrid>
      {view.mode === "groups" ? (
        <FindingsGroups groups={view.groups} severity={severity} range={range} toolbar={toolbar} empty={empty} />
      ) : (
        <FindingsTable rows={view.rows} total={view.total} page={view.page} pageSize={view.pageSize} toolbar={toolbar} empty={empty} />
      )}
    </div>
  )
}
