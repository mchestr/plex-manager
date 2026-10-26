"use client"

import Link from "next/link"

import { RewindStateBadge } from "@/components/admin/users/detail/rewind-state-badge"
import { StatusBadge, StatusDot } from "@/components/ui/status-badge"
import { rewindRowState } from "@/lib/admin/can-regenerate"
import { userDetail } from "@/lib/admin/routes"
import { plexAccessOf } from "@/lib/admin/users-filter"
import { useFormat } from "@/lib/format-context"
import { resolveStatus } from "@/lib/ui/status"
import type { AdminUserWithWrappedStats } from "@/types/admin"

type User = AdminUserWithWrappedStats

function initials(label: string): string {
  const words = label.split(/[\s@._-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? (words[1]?.[0] ?? "") : "")).toUpperCase()
}

/** Neutral initials, the name as a link to the detail page, then the email (6.3). */
export function MemberCell({ user }: { user: User }) {
  const name = user.name || user.email || "Unknown member"
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-caption font-medium text-muted-foreground"
      >
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-col">
        <Link
          href={userDetail(user.id)}
          className="truncate rounded-sm font-medium text-foreground hover:underline"
          data-testid={`admin-users-name-${user.id}`}
        >
          {name}
        </Link>
        {user.email && user.email !== name && <span className="truncate text-label text-muted-foreground">{user.email}</span>}
      </div>
    </div>
  )
}

/** Owner and Admin as outline badges, Member as plain text. */
export function RoleCell({ user }: { user: User }) {
  return <StatusBadge domain="role" value={user.isOwner ? "owner" : user.isAdmin ? "admin" : "user"} />
}

const SERVICE_LABEL = { plex: "Plex", jellyfin: "Jellyfin" } as const

/** One neutral badge per linked media server (P11.10), or "None" for a row with neither. */
export function ServiceCell({ user }: { user: User }) {
  if (user.services.length === 0) return <span className="text-muted-foreground">None</span>
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="admin-user-service-badge" data-services={user.services.join(" ")}>
      {user.services.map((service) => (
        <StatusBadge key={service} tone="neutral" label={SERVICE_LABEL[service]} />
      ))}
    </span>
  )
}

/** A dot and a word; Unknown carries why: no Plex account, or when Plex was last asked. */
export function PlexAccessCell({ user, unknownSub }: { user: User; unknownSub?: string }) {
  if (user.isOwner) return <span className="text-muted-foreground">Owns the server</span>
  const access = plexAccessOf(user)
  const { tone, label } = resolveStatus("plexAccess", access)
  const sub = access !== "unknown" ? undefined : user.plexUserId ? unknownSub : "No Plex account"
  return (
    <span className="inline-flex flex-col gap-0.5" data-testid={`admin-users-plex-${user.id}`}>
      <StatusDot tone={tone} label={label} />
      {sub && <span className="text-caption text-muted-foreground">{sub}</span>}
    </span>
  )
}

/** The subscription with its renewal or end date, else the exemption, else None. */
export function SubscriptionCell({ user }: { user: User }) {
  const f = useFormat()
  const status = user.subscriptionStatus
  if (status && status !== "INCOMPLETE") {
    const sub =
      status !== "CANCELED" && user.cancelAtPeriodEnd && user.currentPeriodEnd
        ? `Ends ${f.date(user.currentPeriodEnd)}`
        : resolveStatus("subscription", status, { date: user.currentPeriodEnd ?? undefined, settings: f.settings }).sub
    return <StatusBadge domain="subscription" value={status} sub={sub ?? ""} />
  }
  if (user.isOwner || user.isAdmin) return <StatusBadge domain="exemption" value="notRequired" />
  if (user.isExempt) return <StatusBadge domain="exemption" value="exempt" sub={user.exemptNote ?? ""} />
  return <StatusBadge domain="subscription" value="none" />
}

/** The season year's Rewind, "Stuck" past the 15-minute rule. */
export function RewindCell({ user, now }: { user: User; now: number }) {
  return <RewindStateBadge state={rewindRowState(user.wrappedStatus, user.wrappedRunStartedAt, now)} />
}
