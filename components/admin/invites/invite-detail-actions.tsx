"use client"

import { Copy, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useCopyInviteLink } from "@/hooks/admin/use-copy-invite-link"

import { DeleteInviteDialog } from "./delete-invite-dialog"

/** The invite detail page's Copy link and Delete (P10.1); a delete lands on the list with a toast. */
export function InviteDetailActions({ invite }: { invite: { id: string; code: string } }) {
  const router = useRouter()
  const copy = useCopyInviteLink()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Button variant="secondary" icon={<Icon icon={Trash2} />} onClick={() => setConfirming(true)} data-testid="admin-invite-delete-button">
        Delete...
      </Button>
      <Button icon={<Icon icon={Copy} />} onClick={() => copy(invite.code)} data-testid="admin-invite-copy-link">
        Copy link
      </Button>
      <DeleteInviteDialog
        invite={confirming ? invite : null}
        onOpenChange={setConfirming}
        onDeleted={() => router.push("/admin/invites")}
      />
    </>
  )
}
