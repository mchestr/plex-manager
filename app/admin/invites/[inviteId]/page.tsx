import { notFound } from "next/navigation"
import { z } from "zod"

import { InviteDetailActions } from "@/components/admin/invites/invite-detail-actions"
import { InviteFacts } from "@/components/admin/invites/invite-facts"
import { InviteUsageTable } from "@/components/admin/invites/invite-usage-table"
import { InvitePass } from "@/components/invite/invite-pass"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { getInviteDetail } from "@/lib/admin/invites/queries"
import { invitePassFor } from "@/lib/invites/pass"
import { getFormat } from "@/lib/settings/app-settings"
import { resolveStatus } from "@/lib/ui/status"

const inviteIdSchema = z.string().min(1).max(64)

/**
 * One invite (P10.1): the code with its status, the settings, a preview of
 * the InvitePass exactly as the invitee sees it (P10.26), and who joined.
 */
export default async function InviteDetailPage({ params }: { params: Promise<{ inviteId: string }> }) {
  const parsed = inviteIdSchema.safeParse((await params).inviteId)
  if (!parsed.success) notFound()
  const invite = await getInviteDetail(parsed.data)
  if (!invite) notFound()

  const [pass, f] = await Promise.all([invitePassFor(invite), getFormat()])
  const left = Math.max(0, invite.maxUses - invite.useCount)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-invite-page">
      <PageHeader
        title={invite.code}
        breadcrumbs={[{ label: "Invites", href: "/admin/invites" }, { label: invite.code }]}
        meta={
          <>
            <StatusBadge
              domain="invite"
              value={invite.status}
              sub={resolveStatus("invite", invite.status, { usesLeft: left, usesTotal: invite.maxUses }).sub}
              data-testid="admin-invite-status"
            />
            <Badge variant="outline">{invite.serverType === "JELLYFIN" ? "Jellyfin" : "Plex"}</Badge>
          </>
        }
        actions={<InviteDetailActions invite={{ id: invite.id, code: invite.code }} />}
        data-testid="admin-invite-header"
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <InviteFacts invite={invite} libraries={pass.libraries} f={f} />
        <section aria-labelledby="invite-preview-heading" className="flex flex-col gap-3" data-testid="admin-invite-preview">
          <h2 id="invite-preview-heading" className="text-h3 text-foreground">
            What the invitee sees
          </h2>
          <InvitePass {...pass} preview />
        </section>
      </div>
      <section aria-labelledby="invite-usage-heading" className="flex flex-col gap-3">
        <h2 id="invite-usage-heading" className="text-h3 text-foreground">
          Joined with this invite
        </h2>
        <InviteUsageTable usages={invite.usages} />
      </section>
    </div>
  )
}
