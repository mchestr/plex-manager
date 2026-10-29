"use client"

import { Copy } from "lucide-react"
import { useState, useTransition } from "react"

import { createAffiliateInvite } from "@/actions/affiliate"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormField } from "@/components/ui/form-field"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { useCopyInviteLink } from "@/hooks/use-copy-invite-link"
import { affiliateInviteHeadline } from "@/lib/affiliates/copy"
import { useServerName } from "@/lib/brand-context"
import { AFFILIATE_LABEL_MAX } from "@/lib/validations/affiliates"

interface MakeInviteDialogProps {
  /** The name the invite page shows for this member, or null. */
  inviterName: string | null
  disabled: boolean
  onHoursUnavailable: () => void
}

/**
 * "Make an invite": an optional private label and a preview of the invite
 * page's headline. Once made, the dialog shows the link with Copy; the page
 * refreshes through the action's revalidation.
 */
export function MakeInviteDialog({ inviterName, disabled, onHoursUnavailable }: MakeInviteDialogProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [madeCode, setMadeCode] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const copy = useCopyInviteLink()
  const headline = affiliateInviteHeadline(inviterName, useServerName())

  const show = () => {
    setLabel("")
    setError(null)
    setMadeCode(null)
    setOpen(true)
  }

  const make = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await createAffiliateInvite({ label })
      if (result.success) {
        setMadeCode(result.data.code)
        return
      }
      if (result.code === "HOURS_UNAVAILABLE") onHoursUnavailable()
      setError(result.error)
    })
  }

  return (
    <>
      <Button onClick={show} disabled={disabled} data-testid="invites-make-open">
        Make an invite
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="invites-make-dialog">
          <DialogHeader>
            <DialogTitle>{madeCode ? "Invite made" : "Make an invite"}</DialogTitle>
            <DialogDescription>
              {madeCode ? "Send this link to one person. It works for 48 hours." : "Only you see the label."}
            </DialogDescription>
          </DialogHeader>
          {madeCode ? (
            <div className="flex flex-col gap-6">
              <p className="rounded-lg border bg-muted p-4 font-mono text-ui break-all text-foreground" data-testid="invites-make-link">
                /invite/{madeCode}
              </p>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="ghost" data-testid="invites-make-done" />}>Done</DialogClose>
                <Button icon={<Icon icon={Copy} />} onClick={() => copy(madeCode)} data-testid="invites-make-copy">
                  Copy link
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={make} className="flex flex-col gap-6">
              <FormField name="invites-make-label" label="Label" optional description="For example, the name of the person.">
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={AFFILIATE_LABEL_MAX}
                  disabled={isPending}
                  data-testid="invites-make-label-input"
                />
              </FormField>
              <div className="flex flex-col gap-1">
                <p className="text-label text-muted-foreground">The invite page says</p>
                <p className="text-h3 text-foreground" data-testid="invites-make-preview">
                  {headline}
                </p>
              </div>
              {error && (
                <Alert tone="destructive" data-testid="invites-make-error">
                  {error}
                </Alert>
              )}
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="ghost" data-testid="invites-make-cancel" />}>Cancel</DialogClose>
                <Button type="submit" loading={isPending} loadingLabel="Making" data-testid="invites-make-submit">
                  Make invite
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
