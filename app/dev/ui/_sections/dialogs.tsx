"use client"

import { Trash2, UserX } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useActionDialog } from "@/hooks/use-action-dialog"

import { Row, Specimen } from "./specimen"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function DialogSpecimen() {
  const { showSuccess } = useToast()
  return (
    <Specimen id="dialog" title="Dialog">
      <Row label="Default">
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" data-testid="dev-ui-dialog-open" />}>Invite details</DialogTrigger>
          <DialogContent data-testid="dev-ui-dialog-content">
            <DialogHeader>
              <DialogTitle>Invite for Sam Rivera</DialogTitle>
              <DialogDescription>
                Sam can use this link once, until 30 November. It shares the Movies and TV libraries.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Close</DialogClose>
              <Button data-testid="dev-ui-dialog-toast" onClick={() => showSuccess("Invite link copied")}>
                Copy invite link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Row>
    </Specimen>
  )
}

export function AlertDialogSpecimen() {
  return (
    <Specimen id="alert-dialog" title="AlertDialog">
      <Row label="Destructive">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" icon={<Trash2 />} />}>Delete invite</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete the invite for Sam Rivera?</AlertDialogTitle>
              <AlertDialogDescription>The link stops working straight away. You can create a new one later.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel />
              <AlertDialogAction>Delete invite</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Row>
    </Specimen>
  )
}

export function ConfirmDialogSpecimen() {
  const removeAccess = useActionDialog(
    async () => {
      await wait(1500)
      return { success: true }
    },
    { success: "Access removed", refresh: false }
  )
  return (
    <Specimen id="confirm-dialog" title="ConfirmDialog">
      <Row label="Pending, then done">
        <ConfirmDialog
          trigger={
            <Button variant="destructive" icon={<UserX />} data-testid="dev-ui-confirm-open">
              Remove access
            </Button>
          }
          title="Remove Plex access for Sam Rivera?"
          description="Sam loses every shared library now. Their Rewind and watch history stay."
          confirmLabel="Remove access"
          pendingLabel="Removing"
          tone="destructive"
          action={removeAccess.run}
          confirmTestId="dev-ui-confirm-action"
        />
      </Row>
      <Row label="Error">
        <ConfirmDialog
          trigger={
            <Button variant="secondary" data-testid="dev-ui-confirm-error-open">
              Regenerate Rewind
            </Button>
          }
          confirmTestId="dev-ui-confirm-error-action"
          title="Regenerate the 2026 Rewind for Sam Rivera?"
          description="The current edition stays live until the new one is ready."
          confirmLabel="Regenerate"
          pendingLabel="Regenerating"
          action={async () => {
            await wait(800)
            return { error: "Tautulli didn't answer. Check that it is running, then try again." }
          }}
        />
      </Row>
      <Row label="Type to confirm">
        <ConfirmDialog
          trigger={<Button variant="destructive">Delete account</Button>}
          title="Delete the account for Sam Rivera?"
          description="This removes Sam's invites, history and every Rewind edition. It can't be undone."
          confirmLabel="Delete account"
          pendingLabel="Deleting"
          tone="destructive"
          typeToConfirm="sam rivera"
          action={async () => {
            await wait(800)
            return {}
          }}
        />
      </Row>
    </Specimen>
  )
}
