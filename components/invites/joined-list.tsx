"use client"

import { StatusDot } from "@/components/ui/status-badge"
import { useFormat } from "@/lib/format-context"
import type { JoinedInvite } from "@/lib/member/invites"

/** The people who joined with the affiliate's invites. It never says why someone left. */
export function JoinedList({ joined }: { joined: JoinedInvite[] }) {
  const f = useFormat()
  if (joined.length === 0) {
    return (
      <p className="text-ui text-muted-foreground" data-testid="invites-joined-empty">
        Nobody joined with your invites yet.
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="invites-joined-list">
      {joined.map((person) => (
        <li
          key={person.id}
          className="flex flex-wrap items-center justify-between gap-3 p-4"
          data-testid={`invites-joined-row-${person.id}`}
          data-status={person.status}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-ui font-medium text-foreground">
              {person.status === "removed" ? "A member who left" : (person.name ?? "A member")}
            </p>
            <p className="text-label text-muted-foreground">Joined {f.date(person.joinedAt, "long")}</p>
          </div>
          {person.status !== "removed" && (
            <StatusDot
              tone={person.status === "active" ? "success" : "neutral"}
              label={person.status === "active" ? "Active" : "No longer a member"}
              data-testid={`invites-joined-status-${person.id}`}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
