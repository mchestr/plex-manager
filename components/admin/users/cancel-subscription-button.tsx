"use client"

import { adminCancelSubscription } from "@/actions/admin/subscriptions"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface CancelSubscriptionButtonProps {
  userId: string
  userName: string | null
  onSuccess?: () => void
}

/**
 * Inline menu action that schedules a period-end cancellation of the user's
 * Stripe subscription via {@link adminCancelSubscription}.
 *
 * Uses {@link ConfirmModal} because cancellation is a state-changing, hard-to-
 * reverse action, and the messaging makes clear that access continues until the
 * end of the paid period (removal flows through the webhook).
 */
export function CancelSubscriptionButton({
  userId,
  userName,
  onSuccess,
}: CancelSubscriptionButtonProps) {
  const toast = useToast()
  const router = useRouter()
  const [isCanceling, setIsCanceling] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const handleCancel = async () => {
    setIsCanceling(true)
    try {
      const result = await adminCancelSubscription(userId)
      if ("success" in result) {
        onSuccess?.()
        router.refresh()
        toast.showSuccess("Subscription set to cancel at period end")
      } else {
        toast.showError(result.error || "Failed to cancel subscription")
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to cancel subscription")
    } finally {
      setIsCanceling(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirmModal(true)}
        disabled={isCanceling}
        data-testid="cancel-subscription-button"
        className="w-full flex items-center gap-2 text-sm text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Cancel subscription at period end"
      >
        <svg
          className="w-4 h-4 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{isCanceling ? "Canceling..." : "Cancel Subscription"}</span>
      </button>
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleCancel}
        title="Cancel Subscription"
        message={`Schedule cancellation for ${userName || "this user"}? Their subscription will not renew, but they keep access until the end of the current paid period. Plex access is removed automatically at that time.`}
        confirmText="Confirm Cancellation"
        cancelText="Keep Subscription"
        confirmButtonClass="bg-amber-600 hover:bg-amber-700"
      />
    </>
  )
}
