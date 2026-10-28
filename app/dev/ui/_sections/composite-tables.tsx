"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Copy, SearchX, UserRound, UserX, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { StatusDot } from "@/components/ui/status-badge"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { dateRangeToInstants, parseDateRange } from "@/lib/ui/date-range"
import { parseTableParams } from "@/lib/ui/table-params"
import { formatDateTime } from "@/lib/utils/format"

import { FIXTURE_SEASON, FIXTURE_ZONE, type FixturePlay, type FixtureUser, PLAYS, USERS } from "./composite-fixtures"
import { Specimen } from "./specimen"

const ACCESS = {
  allowed: { tone: "success", label: "Allowed" },
  unknown: { tone: "warning", label: "Unknown" },
  removed: { tone: "neutral", label: "Removed" },
} as const

const userColumns: ColumnDef<FixtureUser>[] = [
  { id: "name", header: "Name", accessorKey: "name", meta: { card: "title" } },
  { id: "email", header: "Email", accessorKey: "email", meta: { card: "sub", priority: 3 } },
  {
    id: "role",
    header: "Role",
    cell: ({ row }) =>
      row.original.role === "Member" ? "Member" : <Badge variant="outline">{row.original.role}</Badge>,
    meta: { card: "field" },
  },
  {
    id: "access",
    header: "Plex access",
    cell: ({ row }) => <StatusDot {...ACCESS[row.original.access]} />,
    meta: { card: "field" },
  },
  { id: "plays", header: "Plays", accessorKey: "plays", meta: { align: "end", card: "field" } },
]

const userActions = () => [
  { id: "view", label: "View profile", icon: UserRound, href: "/admin/users" as const },
  { id: "copy", label: "Copy email", icon: Copy },
  { id: "remove", label: "Remove Plex access...", icon: UserX, variant: "destructive" as const },
]

const playColumns: ColumnDef<FixturePlay>[] = [
  { id: "title", header: "Title", accessorKey: "title", enableSorting: true, meta: { card: "title" } },
  { id: "member", header: "Member", accessorKey: "member", meta: { card: "sub" } },
  { id: "kind", header: "Kind", cell: ({ row }) => (row.original.kind === "movie" ? "Film" : "Episode"), meta: { card: "field" } },
  {
    id: "date",
    header: "Played",
    enableSorting: true,
    cell: ({ row }) => formatDateTime(row.original.playedAt, { timeZone: FIXTURE_ZONE, locale: "en-US" }),
    meta: { card: "field", priority: 3 },
  },
  { id: "minutes", header: "Minutes", accessorKey: "minutes", enableSorting: true, meta: { align: "end", card: "field" } },
]

const FILTERS = [
  {
    param: "kind",
    label: "Kind",
    options: [
      { value: "all", label: "All" },
      { value: "movie", label: "Films" },
      { value: "episode", label: "Episodes" },
    ],
  },
  {
    param: "member",
    label: "Member",
    options: [{ value: "all", label: "All" }, ...USERS.map((user) => ({ value: user.id, label: user.name }))],
  },
]

const SORTS = [
  { value: "-date", label: "Newest first" },
  { value: "date", label: "Oldest first" },
  { value: "title", label: "Title" },
  { value: "-minutes", label: "Longest" },
]

const compare: Record<string, (a: FixturePlay, b: FixturePlay) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  date: (a, b) => a.playedAt.localeCompare(b.playedAt),
  minutes: (a, b) => a.minutes - b.minutes,
}

/** What a list page's server component does: parse the URL, filter, sort and slice. */
function usePlays() {
  const { searchParams, replace } = useReplaceParams()
  const params = parseTableParams(searchParams, {
    sortable: Object.keys(compare),
    defaultSort: { id: "date", desc: true },
  })
  const range = parseDateRange(searchParams)
  const span = range && dateRangeToInstants(range, FIXTURE_ZONE)
  const kind = searchParams.get("kind")
  const member = USERS.find((user) => user.id === searchParams.get("member"))?.name
  const q = params.q.toLowerCase()

  const matching = PLAYS.filter(
    (play) =>
      (!kind || play.kind === kind) &&
      (!member || play.member === member) &&
      (!q || play.title.toLowerCase().includes(q)) &&
      (!span || (Date.parse(play.playedAt) >= span.gte.getTime() && Date.parse(play.playedAt) < span.lt.getTime()))
  ).sort((a, b) => compare[params.sort.id](a, b) * (params.sort.desc ? -1 : 1))
  const start = (params.page - 1) * params.pageSize

  const clear = () => replace({ kind: null, member: null, q: null, from: null, to: null, page: null })
  return { params, matching, rows: matching.slice(start, start + params.pageSize), clear }
}

export function DataTableSpecimen() {
  const { params, matching, rows, clear } = usePlays()

  return (
    <Specimen id="data-table" title="DataTable, FilterBar and DateRangeFilter">
      <DataTable
        label="Members"
        noun="members"
        columns={userColumns}
        data={USERS}
        getRowId={(user) => user.id}
        getRowHref={() => "/admin/users"}
        getRowName={(user) => user.name}
        rowActions={userActions}
        pagination={{ page: 1, pageSize: 25, total: USERS.length }}
        empty={null}
        data-testid="dev-ui-users-table"
      />
      <DataTable
        label="Plays"
        noun="plays"
        columns={playColumns}
        data={rows}
        getRowId={(play) => play.id}
        getRowHref={() => "/admin/users"}
        sort={params.sort}
        pagination={{ page: params.page, pageSize: params.pageSize, total: matching.length }}
        toolbar={
          <div className="flex flex-col gap-3" data-testid="dev-ui-filter-bar">
            <FilterBar
              search={{ param: "q", placeholder: "Search titles" }}
              filters={FILTERS}
              sort={{ param: "sort", options: SORTS }}
              resultCount={{ shown: matching.length, total: PLAYS.length, noun: "plays" }}
              data-testid="dev-ui-plays-filters"
            />
            <DateRangeFilter zone={FIXTURE_ZONE} season={FIXTURE_SEASON} data-testid="dev-ui-date-range-filter" />
          </div>
        }
        empty={
          <EmptyState
            kind="filtered"
            icon={SearchX}
            title="No plays match these filters"
            description="Try another member, kind or date range."
            primaryAction={
              <Button variant="outline" onClick={clear} data-testid="dev-ui-plays-empty-clear">
                Clear filters
              </Button>
            }
          />
        }
        data-testid="dev-ui-plays-table"
      />
      <DataTable
        label="Loading members"
        noun="members"
        columns={userColumns}
        data={[]}
        getRowId={(user) => user.id}
        pagination={{ page: 1, pageSize: 5, total: 0 }}
        loading
        empty={<EmptyState kind="first-use" icon={Users} title="No members yet" description="Invite someone to start." />}
        data-testid="dev-ui-loading-table"
      />
    </Specimen>
  )
}
