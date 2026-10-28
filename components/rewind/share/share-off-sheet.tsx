"use client"

import type { Route } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface ShareOffSheetProps {
  open: boolean
  onClose: () => void
  /** The viewer's own Rewind on its share sheet, when the preview shows their Rewind. */
  href?: Route
}

/**
 * The share sheet of a story without a share setup: an admin's dry run
 * (P7.10), the admin preview of a stored Rewind (P7.9) and the dev stage.
 * Sharing is a member's own action, so the back cover's "Share the poster"
 * and "Change" open this instead of nothing: it says where sharing happens,
 * and on an admin's own Rewind it opens that Rewind's share sheet.
 */
export function ShareOffSheet({ open, onClose, href }: ShareOffSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" grabber data-testid="rewind-share-off" className="font-display">
        <SheetHeader>
          <SheetTitle>Share</SheetTitle>
          <SheetDescription>Sharing is off in this preview.</SheetDescription>
        </SheetHeader>
        <p className="font-text text-ui" data-testid="rewind-share-off-line">
          {href ? "This is your own Rewind. Open it to share cards or a link." : "Members share cards and links from their own Rewind."}
        </p>
        {href ? (
          <Button variant="ink" size="pill" nativeButton={false} render={<Link href={href} />} data-testid="rewind-share-off-open">
            Open my Rewind
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
