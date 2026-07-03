"use client"

import { adminGrantAccess } from "@/actions/admin/subscriptions"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface GrantAccessButtonProps {
  userId: string
  userName: string | null
  onSuccess?: () => void
}

/**
 * Inline menu action that grants a user comp (complimentary) access via
 * {@link adminGrantAccess}: it invites them to the Plex server and marks them
 * exempt from the subscription requirement.
 *
 * Confirmed through {@link ConfirmModal} because it invites the user to the
 * server and changes their exemption state.
 */
export function GrantAccessButton({
  userId,
  userName,
  onSuccess,
}: GrantAccessButtonProps) {
  const toast = useToast()
  const router = useRouter()
  const [isGranting, setIsGranting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const handleGrant = async () => {
    setIsGranting(true)
    try {
      const result = await adminGrantAccess(userId)
      if ("success" in result) {
        onSuccess?.()
        router.refresh()
        toast.showSuccess("Comp access granted")
      } else {
        toast.showError(result.error || "Failed to grant access")
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to grant access")
    } finally {
      setIsGranting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirmModal(true)}
        disabled={isGranting}
        data-testid="grant-access-button"
        className="w-full flex items-center gap-2 text-sm text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Grant comp access (invite + exempt)"
      >
        <svg
          className="w-4 h-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span>{isGranting ? "Granting..." : "Grant Access (Comp)"}</span>
      </button>
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleGrant}
        title="Grant Comp Access"
        message={`Grant complimentary access to ${userName || "this user"}? They will be invited to the Plex server and marked exempt from the subscription requirement.`}
        confirmText="Grant Access"
        cancelText="Cancel"
        confirmButtonClass="bg-green-600 hover:bg-green-700"
      />
    </>
  )
}
