"use client"

import { updateUserAdminStatus } from "@/actions/admin"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"

interface ChangeUserRoleButtonProps {
  userId: string
  userName: string | null
  currentIsAdmin: boolean
}

export function ChangeUserRoleButton({
  userId,
  userName,
  currentIsAdmin,
}: ChangeUserRoleButtonProps) {
  const toast = useToast()
  const [isUpdating, setIsUpdating] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const router = useRouter()

  const handleRoleChange = async () => {
    setIsUpdating(true)
    setShowSuccess(false)

    try {
      const result = await updateUserAdminStatus(userId, !currentIsAdmin)
      if (result.success) {
        // Force refresh to show updated status
        router.refresh()

        // Show success flash indicator
        setShowSuccess(true)
        toast.showSuccess(`User role ${!currentIsAdmin ? "granted" : "removed"} successfully`)
        // Hide success message after 3 seconds
        setTimeout(() => {
          setShowSuccess(false)
        }, 3000)
      } else {
        toast.showError(result.error || "Failed to update user role")
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to update user role")
    } finally {
      setIsUpdating(false)
    }
  }

  const actionText = currentIsAdmin ? "Remove Admin" : "Make Admin"
  const confirmMessage = currentIsAdmin
    ? `Are you sure you want to remove admin privileges from ${userName || "this user"}? They will lose access to admin features.`
    : `Are you sure you want to grant admin privileges to ${userName || "this user"}? They will gain access to all admin features.`

  return (
    <>
      <button
        onClick={() => setShowConfirmModal(true)}
        disabled={isUpdating}
        className={`px-3 py-1.5 text-white text-sm font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
          showSuccess
            ? "bg-green-600 hover:bg-green-700 animate-pulse"
            : currentIsAdmin
            ? "bg-red-600 hover:bg-red-700"
            : "bg-purple-600 hover:bg-purple-700"
        }`}
        title={actionText}
      >
        {isUpdating ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Updating...</span>
          </>
        ) : showSuccess ? (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Updated!</span>
          </>
        ) : (
          <>
            {currentIsAdmin ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            )}
            <span>{actionText}</span>
          </>
        )}
      </button>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleRoleChange}
        title={`${actionText} Privileges`}
        message={confirmMessage}
        confirmText={actionText}
        cancelText="Cancel"
        confirmButtonClass={
          currentIsAdmin
            ? "bg-red-600 hover:bg-red-700"
            : "bg-purple-600 hover:bg-purple-700"
        }
      />
    </>
  )
}


