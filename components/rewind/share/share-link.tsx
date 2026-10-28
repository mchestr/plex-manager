"use client"

import { useId, useState } from "react"

import { useRecordShare } from "@/components/rewind/stage/use-record-view"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { confirmLine } from "@/lib/rewind/share-sheet"

import { useShare } from "./share-context"

async function copy(url: string, showSuccess: (message: string) => void, onCopied: () => void) {
  try {
    await navigator.clipboard.writeText(url)
    showSuccess("Link copied")
    onCopied()
  } catch {
    // The address stays on screen to copy by hand.
  }
}

/**
 * Copy link, or "Create a public link" and its confirm step (design 6.5
 * step 4). The confirm step names exactly what becomes public: how many
 * cards, whether the name shows, and when the link stops; no expiry is a
 * choice made there. A link made in an earlier visit has no URL to copy (only
 * its hash is stored), so copying it makes a new address and stops the old.
 * "Stop sharing" ends a live link at once, membership or not.
 */
export function ShareLink({ onNeedsMembership, stopOnly = false }: { onNeedsMembership: () => void; stopOnly?: boolean }) {
  const share = useShare()
  const recordShare = useRecordShare()
  const { showSuccess, showError } = useToast()
  const id = useId()
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle")
  const [never, setNever] = useState(false)
  if (!share || !share.setup.publicLinks) return null
  const { setup, actions, choices, link, url, setLink } = share

  const create = async () => {
    setStep("busy")
    const result = link
      ? await actions.rotate({ shareId: link.shareId })
      : await actions.enable({ year: setup.year, pages: setup.cards, ...choices, expiresAt: never ? "never" : "season-close" })
    setStep("idle")
    if (!result.success) {
      if (result.code === "NOT_ENTITLED") onNeedsMembership()
      else showError(result.error)
      return
    }
    setLink({ shareId: result.data.shareId, pages: link?.pages ?? setup.cards, expiresAt: result.data.expiresAt }, result.data.url)
    await copy(result.data.url, showSuccess, () => recordShare("link"))
  }

  const stop = async () => {
    if (!link) return
    setStep("busy")
    const result = await actions.disable({ shareId: link.shareId })
    setStep("idle")
    if (!result.success) return showError(result.error)
    setLink(null, null)
    showSuccess("Public link stopped")
  }

  const stopButton = link ? (
    <Button variant="link" className="self-start" onClick={stop} disabled={step === "busy"} data-testid="rewind-share-stop">
      Stop sharing
    </Button>
  ) : null
  // A lapsed member can still stop a link (FR-51).
  if (stopOnly) return stopButton

  if (step !== "idle") {
    return (
      <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 border-t border-border pt-4" data-testid="rewind-share-confirm">
        <h3 id={`${id}-title`} className="text-ui font-semibold">
          {link ? "Make a new link?" : "Create a public link?"}
        </h3>
        <p className="font-text text-ui" data-testid="rewind-share-confirm-line">
          {link
            ? "Your old link stops working. The new link is copied."
            : confirmLine({ cards: setup.cards.length, signed: choices.signed, expires: never ? null : setup.seasonCloses })}
        </p>
        {link ? null : (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={`${id}-never`}>No expiry</Label>
            <Switch id={`${id}-never`} checked={never} onCheckedChange={setNever} data-testid="rewind-share-no-expiry" />
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ink" size="pill" onClick={create} disabled={step === "busy"} data-testid="rewind-share-create">
            {link ? "Make a new link" : "Create link"}
          </Button>
          <Button variant="ink-outline" size="pill" onClick={() => setStep("idle")} disabled={step === "busy"}>
            Cancel
          </Button>
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ink-outline"
        size="pill"
        onClick={() => (url ? void copy(url, showSuccess, () => recordShare("link")) : setStep("confirm"))}
        data-testid="rewind-share-copy-link"
      >
        {url ? "Copy link" : link ? "Copy a new link" : "Create a public link"}
      </Button>
      {url ? (
        <p className="font-text text-ui break-all" data-testid="rewind-share-url">
          {url}
        </p>
      ) : null}
      {stopButton}
    </div>
  )
}
