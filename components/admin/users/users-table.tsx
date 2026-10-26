"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { SearchX, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { llmUsage } from "@/lib/admin/routes"
import { listUserTarget } from "@/lib/admin/user-actions"
import { useFormat } from "@/lib/format-context"
import type { TableSort } from "@/lib/ui/table-params"
import type { AdminUserWithWrappedStats } from "@/types/admin"

import { useUserActions } from "./actions/use-user-actions"
import { MemberCell, PlexAccessCell, RewindCell, RoleCell, ServiceCell, SubscriptionCell } from "./user-cells"
import { ImportPlexUsersButton } from "./import-plex-users-button"

type User = AdminUserWithWrappedStats

const FILTERS = [
  {
    param: "role",
    label: "Role",
    options: [
      { value: "all", label: "All" },
      { value: "admin", label: "Admin" },
      { value: "member", label: "Member" },
    ],
  },
  {
    param: "service",
    label: "Service",
    options: [
      { value: "all", label: "All" },
      { value: "plex", label: "Plex" },
      { value: "jellyfin", label: "Jellyfin" },
    ],
  },
  {
    param: "plexAccess",
    label: "Plex access",
    options: [
      { value: "all", label: "All" },
      { value: "shared", label: "Shared" },
      { value: "notShared", label: "Not shared" },
      { value: "unknown", label: "Unknown" },
    ],
  },
  {
    param: "subscription",
    label: "Subscription",
    options: [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "pastDue", label: "Past due" },
      { value: "canceled", label: "Canceled" },
      { value: "none", label: "None" },
    ],
  },
]

const MOBILE_SORTS = [
  { value: "-joined", label: "Joined, newest" },
  { value: "joined", label: "Joined, oldest" },
  { value: "name", label: "Name" },
  { value: "-cost", label: "LLM cost, highest" },
]

interface UsersTableProps {
  /** This page's rows, already filtered, sorted and sliced on the server. */
  rows: User[]
  /** Rows matching the filters, across every page. */
  total: number
  /** Every member, for "3 of 7 members". */
  memberCount: number
  page: number
  pageSize: number
  sort: TableSort
  /** The season year: the Rewind column, View Rewind and Regenerate. */
  year: number
  stripeEnabled: boolean
  stripeDashboardBaseUrl: string | null
  estimateCopy: string
  /** The Unknown sub-line while Plex is down: "Last checked 2 minutes ago". */
  unknownSub?: string
  /** A role without admin rights: no member actions and no link to the usage pages. */
  readOnly?: boolean
}

/**
 * The users list (P10.18, ui-design-system 6.3): the reference DataTable for
 * the admin list pages. URL-driven filters and sort, a menu of every member
 * action headed with the member's name, and both EmptyState kinds.
 */
export function UsersTable({ rows, total, memberCount, page, pageSize, sort, year, stripeEnabled, stripeDashboardBaseUrl, estimateCopy, unknownSub, readOnly = false }: UsersTableProps) {
  const f = useFormat()
  const { replace } = useReplaceParams()
  const [now] = useState(() => Date.now())
  const { actionsFor, dialogs } = useUserActions({ year, stripeEnabled, stripeDashboardBaseUrl, estimateCopy, inList: true })

  const columns: ColumnDef<User>[] = [
    { id: "name", header: "Member", enableSorting: true, cell: ({ row }) => <MemberCell user={row.original} />, meta: { mobile: "title" } },
    { id: "role", header: "Role", cell: ({ row }) => <RoleCell user={row.original} />, meta: { mobile: "hidden" } },
    { id: "service", header: "Service", cell: ({ row }) => <ServiceCell user={row.original} />, meta: { mobile: "badges" } },
    { id: "plexAccess", header: "Plex access", cell: ({ row }) => <PlexAccessCell user={row.original} unknownSub={unknownSub} />, meta: { mobile: "badges" } },
    { id: "subscription", header: "Subscription", cell: ({ row }) => <SubscriptionCell user={row.original} />, meta: { mobile: "badges" } },
    { id: "rewind", header: `Rewind ${year}`, cell: ({ row }) => <RewindCell user={row.original} now={now} />, meta: { mobile: "hidden", priority: 3 } },
    {
      id: "cost",
      header: "LLM cost",
      enableSorting: true,
      cell: ({ row }) => {
        const usage = row.original.totalLlmUsage
        if (!usage) return <span className="text-muted-foreground">–</span>
        if (readOnly) return f.money(usage.cost, "table")
        return (
          <Link data-testid={`admin-users-cost-${row.original.id}`} href={llmUsage({ userId: row.original.id })} className="rounded-sm text-foreground hover:underline">
            {f.money(usage.cost, "table")}
          </Link>
        )
      },
      meta: { align: "end", mobile: "meta" },
    },
    { id: "joined", header: "Joined", enableSorting: true, cell: ({ row }) => f.date(row.original.createdAt, "short"), meta: { mobile: "meta" } },
  ]

  const clearFilters = () => replace({ q: null, role: null, service: null, plexAccess: null, subscription: null, page: null })
  const empty =
    memberCount === 0 ? (
      <EmptyState
        kind="first-use"
        icon={Users}
        title="No members yet"
        description="Members appear here when they sign in, or when you import them from Plex."
        primaryAction={<ImportPlexUsersButton />}
        data-testid="admin-users-empty"
      />
    ) : (
      <EmptyState
        kind="filtered"
        icon={SearchX}
        title="No members match these filters"
        description="Clear the filters to see everyone."
        primaryAction={
          <Button data-testid="admin-users-clear-filters" variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        }
        data-testid="admin-users-empty-filtered"
      />
    )

  return (
    <>
      <DataTable
        label="Members"
        noun="members"
        columns={columns}
        data={rows}
        getRowId={(user) => user.id}
        getRowName={(user) => user.name || user.email || "Unknown member"}
        rowActions={readOnly ? undefined : (user) => actionsFor(listUserTarget(user))}
        pagination={{ page, pageSize, total }}
        sort={sort}
        empty={empty}
        toolbar={
          <FilterBar
            search={{ param: "q", placeholder: "Search name or email" }}
            filters={FILTERS}
            sort={{ param: "sort", options: MOBILE_SORTS }}
            resultCount={{ shown: total, total: memberCount, noun: "members" }}
            data-testid="admin-users-filters"
          />
        }
        data-testid="admin-users"
      />
      {dialogs}
    </>
  )
}
