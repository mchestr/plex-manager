"use client"

import { Check, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/toast"
import { adminErrorHint } from "@/lib/wrapped/generation-errors"

/** Shown when a run for this member and year is already in progress. */
const ALREADY_GENERATING_COPY = "This member's Rewind is already being made. Try again when it finishes."

interface RegenerateWrappedButtonProps {
  userId: string
  /** The member's plex.tv account ID, named in the admin hint for a typed failure. */
  plexUserId: string | null
  /** The season year (`getSeasonYear()`), never the calendar year. */
  year: number
  onSuccess?: () => void
  inline?: boolean
}

export function RegenerateWrappedButton({
  userId,
  plexUserId,
  year,
  onSuccess,
  inline = false,
}: RegenerateWrappedButtonProps) {
  const toast = useToast()
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const router = useRouter()

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    setShowSuccess(false)

    try {
      const result = await adminRegenerateRewind({ userId, year })
      if (result.success && result.data.alreadyQueued) {
        toast.showError(ALREADY_GENERATING_COPY)
      } else if (result.success) {
        onSuccess?.()
        // Force refresh to show updated status
        router.refresh()

        // Show success flash indicator
        setShowSuccess(true)
        toast.showSuccess("Wrapped regeneration started successfully")
        // Hide success message after 3 seconds
        setTimeout(() => {
          setShowSuccess(false)
        }, 3000)
      } else if (result.code === "REWIND_NOT_ELIGIBLE") {
        // An ineligible member: show the admin hint, not the member copy.
        toast.showError(adminErrorHint(result.code, plexUserId) ?? result.error)
      } else {
        toast.showError(result.error || "Failed to regenerate wrapped")
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to regenerate wrapped")
    } finally {
      setIsRegenerating(false)
    }
  }

  const label = isRegenerating ? "Regenerating wrapped" : showSuccess ? "Regeneration started" : "Regenerate wrapped"
  const stateIcon = isRegenerating ? (
    <Spinner />
  ) : showSuccess ? (
    <Icon icon={Check} className="text-success" data-testid="regenerate-icon-done" />
  ) : (
    <Icon icon={RefreshCw} data-testid="regenerate-icon-idle" />
  )

  const confirmModal = (
    <ConfirmModal
      isOpen={showConfirmModal}
      onClose={() => setShowConfirmModal(false)}
      onConfirm={handleRegenerate}
      title="Regenerate Wrapped"
      message={`Are you sure you want to regenerate the ${year} wrapped for this user? The current one stays live until the new one is ready.`}
      confirmText="Regenerate"
      cancelText="Cancel"
    />
  )

  if (inline) {
    return (
      <>
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={isRegenerating}
          aria-busy={isRegenerating}
          className="w-full flex items-center gap-2 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={label}
        >
          {stateIcon}
          <span>
            {isRegenerating ? "Regenerating..." : showSuccess ? "Started!" : "Regenerate Wrapped"}
          </span>
        </button>
        {confirmModal}
      </>
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        size="icon-sm"
        onClick={() => setShowConfirmModal(true)}
        disabled={isRegenerating}
        aria-busy={isRegenerating || undefined}
        aria-label={label}
      >
        {stateIcon}
      </Button>
      {confirmModal}
    </>
  )
}
