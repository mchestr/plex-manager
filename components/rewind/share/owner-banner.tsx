"use client"

import Link from "next/link"
import { useState } from "react"

import { disableRewindShare, rotateRewindShare } from "@/actions/rewind-sharing"
import { disableWrappedShareLink } from "@/actions/wrapped-share-link"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

type OwnerBannerProps =
  | { kind: "v3"; shareId: string; year: number; publicUntil: string | null }
  | { kind: "v2"; year: number; publicUntil: string | null }

/**
 * The share page's banner for the link's owner (design 6.6): when the page
 * stops being public, then "Change cards" (the share sheet), "Make a new link"
 * and "Stop sharing", each a confirm step. Rotate shows the new address once,
 * with Copy; the old one is a 404 from then on. A surviving v2 link offers
 * only Stop sharing.
 */
export function OwnerBanner(props: OwnerBannerProps) {
  const { showSuccess } = useToast()
  const [newUrl, setNewUrl] = useState<string | null>(null)
  const [stopped, setStopped] = useState(false)

  const stop = async (): Promise<{ error?: string }> => {
    const result = props.kind === "v3" ? await disableRewindShare({ shareId: props.shareId }) : await disableWrappedShareLink({ year: props.year })
    if (!result.success) return { error: result.error }
    setStopped(true)
    return {}
  }

  const rotate = async (): Promise<{ error?: string }> => {
    if (props.kind !== "v3") return {}
    const result = await rotateRewindShare({ shareId: props.shareId })
    if (!result.success) return { error: result.error }
    setNewUrl(result.data.url)
    return {}
  }

  const copy = async () => {
    if (!newUrl) return
    try {
      await navigator.clipboard.writeText(newUrl)
      showSuccess("Link copied")
    } catch {
      // The address stays on screen to copy by hand.
    }
  }

  if (stopped) {
    return (
      <p role="status" className="font-text text-body" data-testid="rewind-share-owner-banner">
        This page is no longer shared.
      </p>
    )
  }

  if (newUrl) {
    return (
      <section aria-label="Your new link" className="flex flex-col gap-3 border-y border-current py-4" data-testid="rewind-share-owner-banner">
        <p className="font-text text-body">Copy the new link now. It won&apos;t be shown again.</p>
        <p className="font-text text-ui break-all" data-testid="rewind-share-new-url">
          {newUrl}
        </p>
        <Button variant="ink" size="pill" className="self-start" onClick={copy} data-testid="rewind-share-new-url-copy">
          Copy
        </Button>
      </section>
    )
  }

  return (
    <section aria-label="Your public link" className="flex flex-col gap-3 border-y border-current py-4" data-testid="rewind-share-owner-banner">
      <p className="font-text text-body" data-testid="rewind-share-owner-until">
        {props.publicUntil ? `This page is public until ${props.publicUntil}.` : "This page is public until you stop sharing it."}
      </p>
      <div className="flex flex-wrap gap-2">
        {props.kind === "v3" ? (
          <>
            <Button variant="ink-outline" size="pill" render={<Link href={`/rewind/${props.year}?sheet=share`} />} nativeButton={false} data-testid="rewind-share-change-cards">
              Change cards
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ink-outline" size="pill" data-testid="rewind-share-rotate">
                  Make a new link
                </Button>
              }
              title="Make a new link for this page?"
              description="The link you shared stops working immediately. The new link shows here one time."
              confirmLabel="Make a new link"
              pendingLabel="Making"
              action={rotate}
              confirmTestId="rewind-share-rotate-confirm"
            />
          </>
        ) : null}
        <ConfirmDialog
          trigger={
            <Button variant="ink-outline" size="pill" data-testid="rewind-share-stop-sharing">
              Stop sharing
            </Button>
          }
          title="Stop sharing this page?"
          description="After this, the link shows “This Rewind is no longer shared”."
          confirmLabel="Stop sharing"
          pendingLabel="Stopping"
          tone="destructive"
          action={stop}
          confirmTestId="rewind-share-stop-confirm"
        />
      </div>
    </section>
  )
}
