"use client"

import { Copy } from "lucide-react"
import Link from "next/link"
import { Suspense, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { useCopyInviteLink } from "@/hooks/admin/use-copy-invite-link"
import { useOpenFromParam } from "@/hooks/use-open-from-param"
import { invite as inviteRoute } from "@/lib/admin/routes"
import type { LibraryListing } from "@/types/invite"

import { type CreatedInvite, CreateInviteForm } from "./create-invite-form"

interface CreateInviteDialogProps {
  plexLibraries: Promise<LibraryListing>
  jellyfinLibraries: Promise<LibraryListing>
  /** Opens from `?create=1`, the command menu's Create invite (P10.16). Set it on one trigger per page. */
  openFromParam?: boolean
  /** The trigger's test id. */
  "data-testid": string
}

/**
 * "Create invite" and its 640px dialog (P10.1). Success swaps the form for
 * the new code with Copy link; the list refreshes through the action's
 * `revalidatePath`.
 */
export function CreateInviteDialog({ plexLibraries, jellyfinLibraries, openFromParam = false, ...props }: CreateInviteDialogProps) {
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<CreatedInvite | null>(null)

  const show = () => {
    setCreated(null)
    setOpen(true)
  }
  useOpenFromParam("create", openFromParam ? show : () => {})

  return (
    <>
      <Button onClick={show} data-testid={props["data-testid"]}>
        Create invite
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="form" align="top" data-testid="admin-invites-create-dialog">
          <DialogHeader>
            <DialogTitle>{created ? "Invite created" : "Create invite"}</DialogTitle>
            <DialogDescription>
              {created ? "Send the link to the person you're inviting." : "A link that lets someone join your server."}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <CreatedInviteView invite={created} />
          ) : (
            <Suspense fallback={<FormSkeleton />}>
              <CreateInviteForm plexLibraries={plexLibraries} jellyfinLibraries={jellyfinLibraries} onCreated={setCreated} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CreatedInviteView({ invite }: { invite: CreatedInvite }) {
  const copy = useCopyInviteLink()
  return (
    <div className="flex flex-col gap-6" data-testid="create-invite-success">
      <div className="rounded-lg border bg-muted p-4">
        <p className="text-label text-muted-foreground">Invite code</p>
        <p className="mt-1 font-mono text-h3 font-semibold tracking-wider break-all text-foreground" data-testid="create-invite-success-code">
          {invite.code}
        </p>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Done</DialogClose>
        <Button variant="secondary" render={<Link href={inviteRoute(invite.id)} />} nativeButton={false}>
          View invite
        </Button>
        <Button icon={<Icon icon={Copy} />} onClick={() => copy(invite.code)} data-testid="create-invite-copy-link">
          Copy link
        </Button>
      </DialogFooter>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading libraries">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}
