"use client"

import { unshareUserLibrary } from "@/actions/users"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"

interface UnshareUserButtonProps {
  userId: string
  userName: string | null
  onSuccess?: () => void
  inline?: boolean
}

export function UnshareUserButton({
  userId,
  userName,
  onSuccess,
  inline = false,
}: UnshareUserButtonProps) {
  const toast = useToast()
  const [isUnsharing, setIsUnsharing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const router = useRouter()

  const handleUnshare = async () => {
    setIsUnsharing(true)
    setShowSuccess(false)

    try {
      const result = await unshareUserLibrary(userId)
      if (result.success) {
        onSuccess?.()
        // Force refresh to show updated status
        router.refresh()

        // Show success flash indicator
        setShowSuccess(true)
        toast.showSuccess("Library access removed successfully")
        // Hide success message after 3 seconds
        setTimeout(() => {
          setShowSuccess(false)
        }, 3000)
      } else {
        toast.showError(result.error || "Failed to unshare library")
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to unshare library")
    } finally {
      setIsUnsharing(false)
    }
  }

  if (inline) {
    return (
      <>
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={isUnsharing}
          className="w-full flex items-center gap-2 text-sm text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Unshare library access"
        >
          {isUnsharing ? (
            <svg
              className="animate-spin h-4 w-4 text-red-400"
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
          ) : showSuccess ? (
            <svg
              className="w-4 h-4 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          )}
          <span>
            {isUnsharing ? "Unsharing..." : showSuccess ? "Unshared!" : "Unshare Library"}
          </span>
        </button>
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleUnshare}
          title="Unshare Library Access"
          message={`Are you sure you want to remove library access for ${userName || "this user"}? This will revoke their access to the Plex server.`}
          confirmText="Unshare"
          cancelText="Cancel"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
        />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={isUnsharing}
          className={`px-2 py-1 text-white text-xs font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 justify-center ${
            showSuccess
              ? "bg-green-600 hover:bg-green-700 animate-pulse"
              : "bg-red-600 hover:bg-red-700"
          }`}
          title="Unshare library access"
        >
          {isUnsharing ? (
            <>
              <svg
                className="animate-spin h-3 w-3"
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
              <span>...</span>
            </>
          ) : showSuccess ? (
            <>
              <svg
                className="w-3 h-3"
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
            </>
          ) : (
            <>
              <svg
                className="w-3 h-3"
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
            </>
          )}
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleUnshare}
        title="Unshare Library Access"
        message={`Are you sure you want to remove library access for ${userName || "this user"}? This will revoke their access to the Plex server.`}
        confirmText="Unshare"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </>
  )
}

