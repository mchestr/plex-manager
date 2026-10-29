"use client"

import { useQuery } from "@tanstack/react-query"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { previewMemberRemoval, removeMember } from "@/actions/admin/member-access"
import { inviterRevokeFailed, NO_REVOKE, RevokeInviterFields } from "@/components/admin/affiliates/revoke-inviter-fields"
import { queryKeys } from "@/hooks/query-keys"
import { Alert } from "@/components/ui/alert"
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
import { Checkbox } from "@/components/ui/checkbox"
import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import type { InvitedBy } from "@/lib/admin/user-actions"
import { countLines, planLines } from "@/lib/members/erase-copy"
import { withFlash } from "@/lib/ui/flash-codes"

interface RemoveMemberDialogProps {
  userId: string
  /** The display name the admin types to confirm. */
  name: string
  /** The affiliate whose invite they joined with: offers to revoke their status too. */
  invitedBy: InvitedBy
  /** Offers to block the Plex account from affiliate invites. */
  hasPlexId: boolean
}

/**
 * "Remove member" (P11.13): opens a dialog that lists the dry run's effects
 * and row counts, and asks for the member's name typed before the destructive
 * button enables. Success returns to the users list with `member_removed`.
 * Two options, both off: revoke the inviting affiliate's status, and block
 * the Plex account from affiliate invites.
 */
export function RemoveMemberDialog({ userId, name, invitedBy, hasPlexId }: RemoveMemberDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [inviter, setInviter] = useState(NO_REVOKE)
  const [block, setBlock] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { showError } = useToast()

  const preview = useQuery({
    queryKey: queryKeys.removeMemberPreview(userId),
    queryFn: async () => {
      const result = await previewMemberRemoval({ userId })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const matches = typed.trim().toLowerCase() === name.toLowerCase()

  const confirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await removeMember({
          userId,
          confirmName: typed,
          block: hasPlexId && block,
          revokeInviter: invitedBy?.approved && inviter.revoke ? { reason: inviter.reason } : undefined,
        })
        if (!result.success) {
          setError(result.error)
          return
        }
        if (result.data.inviterRevoked === false && invitedBy) showError(inviterRevokeFailed(invitedBy.name))
        router.push(withFlash("/admin/users", "member_removed") as Route)
      } catch {
        setError(CONFIRM_FALLBACK_ERROR)
      }
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        if (isPending) {
          details.cancel()
          return
        }
        setOpen(next)
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return
        setTyped("")
        setError(null)
        setInviter(NO_REVOKE)
        setBlock(false)
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" data-testid="admin-remove-member-open" />}>Remove member</AlertDialogTrigger>
      <AlertDialogContent data-testid="admin-remove-member-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This ends their access and deletes their data from this app. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview.isPending && <Skeleton className="h-24" data-testid="admin-remove-member-loading" />}
        {preview.isError && <Alert tone="destructive">{preview.error.message}</Alert>}
        {preview.data && (
          <div className="flex flex-col gap-3 text-ui" data-testid="admin-remove-member-preview">
            <ul className="list-disc pl-5">
              {planLines(preview.data.plan).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              {countLines(preview.data.counts).map(({ key, label, count }) => (
                <div key={key} className="contents" data-testid={`admin-remove-member-count-${key}`}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {invitedBy && (
          <RevokeInviterFields
            inviterName={invitedBy.name}
            canRevoke={invitedBy.approved}
            value={inviter}
            onChange={setInviter}
            disabled={isPending}
            testId="admin-remove-member-revoke-inviter"
          />
        )}
        {hasPlexId && (
          <div className="flex items-start gap-3">
            <Checkbox
              id="admin-remove-member-block"
              checked={block}
              onCheckedChange={setBlock}
              disabled={isPending}
              className="mt-0.5"
              data-testid="admin-remove-member-block"
            />
            <Label htmlFor="admin-remove-member-block">Block this Plex account from affiliate invites</Label>
          </div>
        )}

        <FormField name="admin-remove-member-confirm" label={`Type ${name} to confirm`}>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
            data-testid="admin-remove-member-confirm-input"
          />
        </FormField>
        {error && <Alert tone="destructive">{error}</Alert>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            loading={isPending}
            loadingLabel="Removing"
            disabled={!matches || !preview.data}
            onClick={confirm}
            data-testid="admin-remove-member-button"
          >
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
