import Link from "next/link"
import { Suspense } from "react"

import { getUserActivityTimeline } from "@/actions/user-queries"
import { UserActivityTimeline } from "@/components/admin/users/user-activity-timeline"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { InactivityEmails } from "@/components/admin/users/detail/inactivity-emails"
import { InactivityExclusion } from "@/components/admin/users/detail/inactivity-exclusion"
import { RemoveMemberDialog } from "@/components/admin/users/detail/remove-member-dialog"
import { RequestTiersExclusion } from "@/components/admin/users/detail/request-tiers-exclusion"
import { userDetail } from "@/lib/admin/routes"
import type { UserDetailHeaderData } from "@/lib/admin/user-detail"
import { getMemberInactivityEmails } from "@/lib/data/member-inactivity"
import { prisma } from "@/lib/prisma"
import type { BoundFormat } from "@/lib/utils/format"

import { DetailItem } from "./detail-item"
import { RequestTierCheck } from "./request-tier-check"

const SERVICE_LABEL = { plex: "Plex" } as const

/**
 * When the member last played on Plex, from the daily Tautulli read
 * (`lib/inactivity/sync.ts`): "Never" when Tautulli knows them with no play,
 * "Unknown" when it has not reported them.
 */
function LastSeenOnPlex({ header, f }: { header: UserDetailHeaderData; f: BoundFormat }) {
  if (header.lastSeenAt) {
    return (
      <DetailItem label="Last seen on Plex" testId="admin-user-last-seen-timestamp">
        {f.dateTime(header.lastSeenAt, { zoneLabel: true })}
      </DetailItem>
    )
  }
  return (
    <DetailItem label="Last seen on Plex" testId="admin-user-last-seen">
      {header.lastSeenReadAt ? (
        "Never"
      ) : (
        <>
          Unknown
          <span className="block text-caption text-muted-foreground">Tautulli has not reported this member.</span>
        </>
      )}
    </DetailItem>
  )
}

/**
 * The member's account facts, when they last played on Plex, whether the
 * inactivity sweep may remove them and their warning emails, their request tier, their activity timeline (P10.6) and the danger zone (P11.13).
 */
export async function OverviewTab({ header, f }: { header: UserDetailHeaderData; f: BoundFormat }) {
  // The sweep never removes an admin or the server owner, so its switch and its emails would say nothing
  const sweepApplies = Boolean(header.plexUserId) && !header.isAdmin && !header.isOwner
  const [timeline, tiers, inactivityEmails] = await Promise.all([
    getUserActivityTimeline({ userId: header.id, pageSize: 10 }),
    header.plexUserId
      ? prisma.user.findUnique({ where: { id: header.id }, select: { requestTiersExcluded: true } })
      : null,
    sweepApplies ? getMemberInactivityEmails(header.id) : null,
  ])
  const { discord } = header

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-user-overview">
        <DetailItem label="Email">{header.email ?? "Not set"}</DetailItem>
        <DetailItem label="Service" testId="admin-user-service">
          {SERVICE_LABEL[header.primaryService]}
        </DetailItem>
        <DetailItem label="Joined" testId="admin-user-created-timestamp">
          {f.dateTime(header.createdAt, { zoneLabel: true })}
        </DetailItem>
        {header.plexUserId && <LastSeenOnPlex header={header} f={f} />}
        {header.invitedBy && (
          <DetailItem label="Invited by" testId="admin-user-invited-by">
            <Link href={userDetail(header.invitedBy.id)} className="font-medium hover:underline" data-testid="admin-user-invited-by-link">
              {header.invitedBy.name}
            </Link>
          </DetailItem>
        )}
        <DetailItem label="Discord">
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
        </DetailItem>
        {sweepApplies && (
          <DetailItem label="Inactivity">
            <InactivityExclusion userId={header.id} name={header.name} excluded={header.inactivityExcluded} />
          </DetailItem>
        )}
        {inactivityEmails && <InactivityEmails emails={inactivityEmails} f={f} />}
      </dl>

      {tiers && (
        <section aria-labelledby="admin-user-request-limits-heading" className="flex flex-col gap-3" data-testid="admin-user-request-limits">
          <h2 id="admin-user-request-limits-heading" className="text-h3">
            Request limits
          </h2>
          <Suspense fallback={<Skeleton className="h-36 w-full rounded-lg" data-testid="admin-user-tier-loading" />}>
            <RequestTierCheck userId={header.id} name={header.name} f={f} />
          </Suspense>
          <RequestTiersExclusion userId={header.id} name={header.name} excluded={tiers.requestTiersExcluded} />
        </section>
      )}

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
              Ends their access and deletes their data in this app.
            </p>
          </div>
          <RemoveMemberDialog userId={header.id} name={header.name} invitedBy={header.invitedBy} hasPlexId={header.plexUserId !== null} />
        </section>
      )}
    </div>
  )
}
