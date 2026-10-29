"use client"

import { Copy } from "lucide-react"

import { cancelAffiliateInvite } from "@/actions/affiliate"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { useActionDialog } from "@/hooks/use-action-dialog"
import { useCopyInviteLink } from "@/hooks/use-copy-invite-link"
import { useFormat } from "@/lib/format-context"
import type { OpenInvite } from "@/lib/member/invites"

const cancel = (inviteId: string) => cancelAffiliateInvite({ inviteId })

function CancelInvite({ invite }: { invite: OpenInvite }) {
  // The action revalidates the page, so no router refresh
  const { run } = useActionDialog(cancel, { success: "Invite cancelled", refresh: false })
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost" data-testid={`invites-open-cancel-${invite.id}`}>
          Cancel
        </Button>
      }
      title="Cancel this invite?"
      description="The link stops working, and you get the place back."
      confirmLabel="Cancel invite"
      pendingLabel="Cancelling"
      cancelLabel="Keep it"
      tone="destructive"
      action={() => run(invite.id)}
      data-testid="invites-cancel-dialog"
      confirmTestId={`invites-open-cancel-confirm-${invite.id}`}
    />
  )
}

/** The affiliate's open invites: label, expiry, Copy link and Cancel. */
export function OpenInvites({ invites }: { invites: OpenInvite[] }) {
  const f = useFormat()
  const copy = useCopyInviteLink()
  if (invites.length === 0) {
    return (
      <p className="text-ui text-muted-foreground" data-testid="invites-open-empty">
        You have no open invites.
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="invites-open-list">
      {invites.map((invite) => (
        <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid={`invites-open-row-${invite.id}`}>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-ui font-medium text-foreground">{invite.label ?? "No label"}</p>
            <p className="text-label text-muted-foreground">Expires {f.dateTime(invite.expiresAt)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" icon={<Icon icon={Copy} />} onClick={() => copy(invite.code)} data-testid={`invites-open-copy-${invite.id}`}>
              Copy link
            </Button>
            <CancelInvite invite={invite} />
          </div>
        </li>
      ))}
    </ul>
  )
}
