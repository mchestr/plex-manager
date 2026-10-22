import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { userRewind } from "@/lib/admin/routes"
import { detailUserTarget, type UserDetailHeaderData } from "@/lib/admin/user-detail"
import { rewindRowState } from "@/lib/admin/can-regenerate"

import { RewindStateBadge } from "./rewind-state-badge"
import { UserDetailActions } from "./user-detail-actions"

interface UserDetailHeaderProps {
  header: UserDetailHeaderData
  stripeDashboardBaseUrl: string | null
  /** The Regenerate confirm's cost line. */
  estimateCopy: string
  /** Server time of the render, for the stuck rule. */
  now: number
}

/** The member's name as the h1, their status badges and the actions (P10.6). */
export function UserDetailHeader({ header, stripeDashboardBaseUrl, estimateCopy, now }: UserDetailHeaderProps) {
  const { season } = header
  const role = header.isOwner ? "owner" : header.isAdmin ? "admin" : "user"

  return (
    <PageHeader
      breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: header.name }]}
      title={header.name}
      description={header.email ?? undefined}
      data-testid="admin-user-header"
      meta={
        <>
          <StatusBadge domain="role" value={role} data-testid="admin-user-role-badge" />
          <StatusBadge domain="plexAccess" value={header.plexAccess} data-testid="admin-user-plex-badge" />
          {header.stripeEnabled &&
            (header.subscription ? (
              <StatusBadge domain="subscription" value={header.subscription.status} sub="" data-testid="admin-user-subscription-badge" />
            ) : (
              <StatusBadge tone="plain" label="No subscription" data-testid="admin-user-subscription-badge" />
            ))}
          <RewindStateBadge
            state={rewindRowState(season.status, season.runStartedAt, now)}
            prefix={`Rewind ${season.year}`}
            data-testid="admin-user-rewind-badge"
          />
          {header.disabledAt && (
            <Badge variant="destructive" data-testid="admin-user-disabled-badge">
              Disabled
            </Badge>
          )}
        </>
      }
      actions={
        <>
          <Button variant="outline" nativeButton={false} render={<Link href={userRewind(header.id, season.year)} />} data-testid="admin-user-view-rewind">
            View Rewind {season.year}
          </Button>
          <UserDetailActions
            user={detailUserTarget(header)}
            year={season.year}
            stripeEnabled={header.stripeEnabled}
            stripeDashboardBaseUrl={stripeDashboardBaseUrl}
            estimateCopy={estimateCopy}
          />
        </>
      }
    />
  )
}
