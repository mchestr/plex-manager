"use client"

import { useState, useTransition } from "react"
import { disableWrappedShareLink, enableWrappedShareLink } from "@/actions/wrapped-share-link"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { ShareCardDownload } from "@/components/wrapped/share-card-download"
import { WrappedShareButton } from "@/components/wrapped/wrapped-share-button"

interface WrappedShareControlsProps {
  year: number
  shareToken: string | null
}

/**
 * The owner's controls for the public share link. Sharing is opt-in: without a
 * link the member sees "Create share link"; with one, including a v2 link that
 * was minted before sharing became opt-in, they can copy it, download the
 * card or stop sharing (SEC-16).
 */
export function WrappedShareControls({ year, shareToken: initialShareToken }: WrappedShareControlsProps) {
  const [shareToken, setShareToken] = useState(initialShareToken)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  const createLink = () => {
    startTransition(async () => {
      const result = await enableWrappedShareLink({ year })
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      setShareToken(result.shareToken)
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
      setShareToken(null)
      toast.showSuccess("Sharing stopped. The old link no longer works.")
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
