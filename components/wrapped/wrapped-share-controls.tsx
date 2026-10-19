"use client"

import { useTransition } from "react"
import { disableWrappedShareLink, enableWrappedShareLink } from "@/actions/wrapped-share-link"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { ShareCardDownload } from "@/components/wrapped/share-card-download"
import { WrappedShareButton } from "@/components/wrapped/wrapped-share-button"

interface WrappedShareControlsProps {
  /** The year of the stored Rewind row the controls act on. */
  year: number
  shareToken: string | null
  /** Called with the new token after a link is created, and with null after it is stopped. */
  onShareTokenChange: (shareToken: string | null) => void
}

/**
 * The owner's controls for the public share link. Sharing is opt-in: without a
 * link the member sees "Create share link"; with one, including a v2 link that
 * was minted before sharing became opt-in, they can copy it, download the
 * card or stop sharing (SEC-16).
 *
 * The token is held by the parent, so the controls on the last slide and under
 * "Show all" stay in step.
 */
export function WrappedShareControls({ year, shareToken, onShareTokenChange }: WrappedShareControlsProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const createLink = () => {
    startTransition(async () => {
      const result = await enableWrappedShareLink({ year })
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      onShareTokenChange(result.data.shareToken)
      toast.showSuccess("Share link created")
    })
  }

  const stopSharing = () => {
    startTransition(async () => {
      const result = await disableWrappedShareLink({ year })
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      onShareTokenChange(null)
      toast.showSuccess("Sharing stopped. The link no longer opens, but previews already posted elsewhere may linger.")
    })
  }

  if (!shareToken) {
    return (
      <Button
        data-testid="wrapped-share-create"
        size="lg"
        onClick={createLink}
        disabled={isPending}
        className="rounded-xl font-semibold"
      >
        {isPending ? "Creating link…" : "Create share link"}
      </Button>
    )
  }

  return (
    <>
      <WrappedShareButton shareToken={shareToken} year={year} />
      <ShareCardDownload shareToken={shareToken} year={year} />
      <Button
        data-testid="wrapped-share-stop"
        variant="secondary"
        size="lg"
        onClick={stopSharing}
        disabled={isPending}
        className="rounded-xl font-semibold"
      >
        {isPending ? "Stopping…" : "Stop sharing"}
      </Button>
    </>
  )
}
