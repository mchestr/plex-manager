"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { OpenInvite } from "@/lib/admin/affiliates/rows"
import { useFormat } from "@/lib/format-context"

/** An affiliate's open invites (admins only): the label, the expiry and the code's last 4 characters, never the whole code. */
export function OpenInvitesDialog({ name, invites, testId }: { name: string; invites: OpenInvite[]; testId: string }) {
  const f = useFormat()
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" data-testid={testId}>
            Open invites ({invites.length})
          </Button>
        }
      />
      <DialogContent data-testid={`${testId}-dialog`}>
        <DialogHeader>
          <DialogTitle>{name}&apos;s open invites</DialogTitle>
          {invites.length === 0 && <DialogDescription>None.</DialogDescription>}
        </DialogHeader>
        {invites.length > 0 && (
          <ul className="flex flex-col gap-2 text-ui">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap justify-between gap-2" data-testid={`${testId}-row-${invite.id}`}>
                <span>{invite.label ?? "No label"}</span>
                <span className="font-mono">…{invite.codeEnd}</span>
                <span className="text-muted-foreground">Expires {f.dateTime(invite.expiresAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
