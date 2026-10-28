import { Suspense } from "react"

import { getUserActivityTimeline } from "@/actions/user-queries"
import { UserActivityTimeline } from "@/components/admin/users/user-activity-timeline"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { RemoveMemberDialog } from "@/components/admin/users/detail/remove-member-dialog"
import { RequestTiersExclusion } from "@/components/admin/users/detail/request-tiers-exclusion"
import type { UserDetailHeaderData } from "@/lib/admin/user-detail"
import { prisma } from "@/lib/prisma"
import type { BoundFormat } from "@/lib/utils/format"

import { DetailItem } from "./detail-item"
import { JellyfinAccess } from "./jellyfin-access"
import { RequestTierCheck } from "./request-tier-check"

const SERVICE_LABEL = { plex: "Plex", jellyfin: "Jellyfin" } as const

/**
 * The member's account facts, their Jellyfin access (P11.10), their request
 * tier, their activity timeline (P10.6) and the danger zone (P11.13).
 */
export async function OverviewTab({ header, f }: { header: UserDetailHeaderData; f: BoundFormat }) {
  const [timeline, tiers] = await Promise.all([
    getUserActivityTimeline({ userId: header.id, pageSize: 10 }),
    header.plexUserId
      ? prisma.user.findUnique({ where: { id: header.id }, select: { requestTiersExcluded: true } })
      : null,
  ])
  const { discord } = header

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-user-overview">
        <DetailItem label="Email">{header.email ?? "Not set"}</DetailItem>
        <DetailItem label="Service" testId="admin-user-service">
          {SERVICE_LABEL[header.primaryService]}
          {header.services
            .filter((service) => service !== header.primaryService)
            .map((service) => (
              <span key={service} className="block text-caption text-muted-foreground">
                Also on {SERVICE_LABEL[service]}
              </span>
            ))}
        </DetailItem>
        <DetailItem label="Joined" testId="admin-user-created-timestamp">
          {f.dateTime(header.createdAt, { zoneLabel: true })}
        </DetailItem>
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
        {header.jellyfinUserId && (
          <>
            <DetailItem label="Jellyfin ID" testId="admin-user-jellyfin-id">
              <span className="font-mono text-label break-all">{header.jellyfinUserId}</span>
            </DetailItem>
            <DetailItem label="Jellyfin access">
              <JellyfinAccess userId={header.id} name={header.name} status={header.jellyfinStatus ?? "unknown"} />
            </DetailItem>
          </>
        )}
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
              This cancels their subscription, removes their server access and deletes their data in this app.
            </p>
          </div>
          <RemoveMemberDialog userId={header.id} name={header.name} />
        </section>
      )}
    </div>
  )
}
