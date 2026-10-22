import type { ReactNode } from "react"

import { getUserActivityTimeline } from "@/actions/user-queries"
import { UserActivityTimeline } from "@/components/admin/users/user-activity-timeline"
import { ErrorState } from "@/components/ui/error-state"
import { RemoveMemberDialog } from "@/components/admin/users/detail/remove-member-dialog"
import type { UserDetailHeaderData } from "@/lib/admin/user-detail"
import type { BoundFormat } from "@/lib/utils/format"

const SERVICE_LABEL: Record<string, string> = { plex: "Plex", jellyfin: "Jellyfin" }

function Item({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="text-ui text-foreground" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}

/** The member's account facts, their activity timeline (P10.6) and the danger zone (P11.13). */
export async function OverviewTab({ header, f }: { header: UserDetailHeaderData; f: BoundFormat }) {
  const timeline = await getUserActivityTimeline({ userId: header.id, pageSize: 10 })
  const { discord } = header

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-user-overview">
        <Item label="Email">{header.email ?? "Not set"}</Item>
        <Item label="Service">{header.primaryAuthService ? (SERVICE_LABEL[header.primaryAuthService] ?? header.primaryAuthService) : "Not recorded"}</Item>
        <Item label="Joined" testId="admin-user-created-timestamp">
          {f.dateTime(header.createdAt, { zoneLabel: true })}
        </Item>
        <Item label="Discord">
          {discord ? (
            <>
              {discord.displayName}
              <span className="block text-caption text-muted-foreground">
                {discord.revokedAt ? "Revoked" : `Linked ${f.dateTime(discord.linkedAt, { zoneLabel: true })}`}
              </span>
            </>
          ) : (
            "Not linked"
          )}
        </Item>
      </dl>

      <section aria-labelledby="admin-user-activity-heading" className="flex flex-col gap-3">
        <h2 id="admin-user-activity-heading" className="text-h3">
          Activity
        </h2>
        {timeline.success ? (
          <UserActivityTimeline userId={header.id} initialData={timeline.data} />
        ) : (
          <ErrorState title="Couldn't load the activity" message={timeline.error} />
        )}
      </section>

      {!header.isOwner && (
        <section
          aria-labelledby="admin-user-danger-heading"
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="admin-user-danger-zone"
        >
          <div className="flex flex-col gap-1">
            <h2 id="admin-user-danger-heading" className="text-h3">
              Danger zone
            </h2>
            <p className="text-ui text-muted-foreground">
              Removing a member cancels their subscription, removes their server access and deletes their data here.
            </p>
          </div>
          <RemoveMemberDialog userId={header.id} name={header.name} />
        </section>
      )}
    </div>
  )
}
