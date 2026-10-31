"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { SearchX } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table/data-table"
import { DateRangeFilter } from "@/components/ui/date-range-filter"
import { EmptyState } from "@/components/ui/empty-state"
import { FilterBar } from "@/components/ui/filter-bar"
import { Time } from "@/components/ui/time"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { auditEvent, auditLog } from "@/lib/admin/routes"
import {
  AUDIT_CATEGORIES,
  AUDIT_EVENT_NAMES,
  type AuditCategory,
  type AuditEventName,
  CATEGORY_LABELS,
  eventLabel,
  typesIn,
} from "@/lib/audit/events"
import type { AuditParty, AuditRow } from "@/lib/data/audit-log"
import { icons } from "@/lib/ui/icons"
import { type ParamPatch, tableHref } from "@/lib/ui/table-params"
import { cn } from "@/lib/utils"

const ALL = { value: "all", label: "All" }

const CATEGORY_OPTIONS = [ALL, ...AUDIT_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category] }))]

/** Every filter the page reads, for Clear filters. */
const CLEARED: ParamPatch = { category: null, type: null, actor: null, member: null, run: null, from: null, to: null, page: null }

/** Every event type by label, sorted in a fixed locale so the server and the browser agree. */
const TYPE_OPTIONS = AUDIT_EVENT_NAMES.map((value) => ({ value, label: eventLabel(value) })).sort((a, b) =>
  a.label.localeCompare(b.label, "en")
)

/** The category's event types, keeping the chosen type even when it is in another category. */
function typeOptions(category: AuditCategory | null, type: AuditEventName | null) {
  if (!category) return [ALL, ...TYPE_OPTIONS]
  const types = new Set<string>(typesIn(category))
  return [ALL, ...TYPE_OPTIONS.filter((option) => types.has(option.value) || option.value === type)]
}

function Missing() {
  return <span className="text-muted-foreground">–</span>
}

/** A name that scopes the log to that person; a non-user (System, Removed user) reads muted. */
function PartyLink({ party, href, label, testId }: { party: AuditParty; href: Route; label: string; testId: string }) {
  return (
    <Link
      href={href}
      aria-label={`${label} ${party.name}`}
      className={cn("rounded-sm hover:underline", party.kind === "user" ? "text-foreground" : "text-muted-foreground")}
      data-testid={testId}
    >
      {party.name}
    </Link>
  )
}

function columns(scoped: (patch: ParamPatch) => Route): ColumnDef<AuditRow>[] {
  return [
    {
      id: "time",
      header: "Time",
      cell: ({ row }) => <Time value={row.original.createdAt} data-testid={`admin-audit-time-${row.original.id}-timestamp`} />,
      meta: { card: "title" },
    },
    {
      id: "event",
      header: "Event",
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="text-foreground">{row.original.label}</span>
          {row.original.category && <span className="text-label text-muted-foreground">{CATEGORY_LABELS[row.original.category]}</span>}
        </span>
      ),
      meta: { card: "field" },
    },
    {
      id: "actor",
      header: "By",
      cell: ({ row }) => (
        <PartyLink
          party={row.original.actor}
          href={scoped({ actor: row.original.actor.id })}
          label="Events by"
          testId={`admin-audit-actor-${row.original.id}`}
        />
      ),
      meta: { card: "field" },
    },
    {
      id: "member",
      header: "About",
      cell: ({ row }) =>
        row.original.member ? (
          <PartyLink
            party={row.original.member}
            href={scoped({ member: row.original.member.id })}
            label="Events involving"
            testId={`admin-audit-member-${row.original.id}`}
          />
        ) : (
          <Missing />
        ),
      meta: { card: "field" },
    },
    { id: "summary", header: "Summary", cell: ({ row }) => row.original.summary ?? <Missing />, meta: { card: "field" } },
  ]
}

interface AuditTableProps {
  /** This page's rows, filtered and paged on the server. */
  rows: AuditRow[]
  /** Events matching the filters, across every page. */
  total: number
  page: number
  pageSize: number
  /** The category and type the server read from the URL, which pick the event options. */
  category: AuditCategory | null
  type: AuditEventName | null
  /** Whether any filter is set: an empty list then says "no match", not "nothing yet". */
  filtered: boolean
  /** The server zone, which decides the date filter's "today". */
  zone: string
}

/**
 * The audit log's events, newest first: the time opens the event, a name
 * scopes the log to that person (keeping the other filters), and the dates,
 * category, event and page live in the URL.
 */
export function AuditTable({ rows, total, page, pageSize, category, type, filtered, zone }: AuditTableProps) {
  const { searchParams, replace } = useReplaceParams()
  const scoped = (patch: ParamPatch) => tableHref(auditLog(), searchParams, { ...patch, page: null })

  return (
    <DataTable
      label="Audit events"
      noun="events"
      columns={columns(scoped)}
      data={rows}
      getRowId={(row) => row.id}
      getRowHref={(row) => auditEvent(row.id)}
      pagination={{ page, pageSize, total }}
      toolbar={
        <div className="flex flex-col gap-3">
          <DateRangeFilter zone={zone} data-testid="admin-audit-dates" />
          <FilterBar
            filters={[
              { param: "category", label: "Category", options: CATEGORY_OPTIONS },
              { param: "type", label: "Event", options: typeOptions(category, type) },
            ]}
            resultCount={{ shown: total, total, noun: "events" }}
            data-testid="admin-audit-filters"
          />
        </div>
      }
      empty={
        filtered ? (
          <EmptyState
            kind="filtered"
            icon={SearchX}
            title="No events match these filters"
            primaryAction={
              <Button data-testid="admin-audit-clear-filters" variant="secondary" onClick={() => replace(CLEARED)}>
                Clear filters
              </Button>
            }
            data-testid="admin-audit-empty-filtered"
          />
        ) : (
          <EmptyState
            kind="first-use"
            icon={icons.audit}
            title="No events yet"
            description="Changes to members, access and settings show here as they happen."
            data-testid="admin-audit-empty"
          />
        )
      }
      data-testid="admin-audit"
    />
  )
}
