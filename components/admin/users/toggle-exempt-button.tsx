"use client"

import { adminToggleExempt } from "@/actions/admin/subscriptions"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface ToggleExemptButtonProps {
  userId: string
  userName?: string | null
  isExempt: boolean
  onSuccess?: () => void
}

/**
 * Inline menu action that flips a user's subscription exemption via
 * {@link adminToggleExempt}.
 *
 * The label reflects the resulting state: "Mark Exempt" when the user is not
 * currently exempt, "Remove Exempt" when they are. Marking exempt is a benign
 * grant and applies immediately, but REMOVING exemption can leave a user without
 * access (they fall back under the subscription gate), so that direction is
 * confirmed via {@link ConfirmModal} — consistent with the cancel/grant buttons.
 */
export function ToggleExemptButton({
  userId,
  userName,
  isExempt,
  onSuccess,
}: ToggleExemptButtonProps) {
  const toast = useToast()
  const router = useRouter()
  const [isToggling, setIsToggling] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const handleToggle = async () => {
    setIsToggling(true)
    try {
      const result = await adminToggleExempt(userId)
      if ("success" in result) {
        onSuccess?.()
        router.refresh()
        toast.showSuccess(isExempt ? "Exemption removed" : "User marked exempt")
      } else {
        toast.showError(result.error || "Failed to update exemption")
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to update exemption")
    } finally {
      setIsToggling(false)
    }
  }

  const handleClick = () => {
    // Removing exemption is the risky direction (can drop the user under the
    // subscription gate), so confirm it; marking exempt applies immediately.
    if (isExempt) {
      setShowConfirmModal(true)
    } else {
      void handleToggle()
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isToggling}
        data-testid="toggle-exempt-button"
        className="w-full flex items-center gap-2 text-sm text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title={isExempt ? "Remove subscription exemption" : "Mark user exempt from subscription"}
      >
        <svg
          className="w-4 h-4 text-cyan-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {isToggling ? "Updating..." : isExempt ? "Remove Exempt" : "Mark Exempt"}
        </span>
      </button>
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleToggle}
        title="Remove Exemption"
        message={`Remove the subscription exemption for ${userName || "this user"}? Without an active subscription, they will lose access to the app until they subscribe.`}
        confirmText="Remove Exemption"
        cancelText="Keep Exempt"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </>
  )
}
