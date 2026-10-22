"use client"

import { Ban, Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { unshareUserLibrary } from "@/actions/users"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/toast"

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
        toast.showSuccess(
          result.data.status === "already_removed"
            ? "Library access was already removed"
            : "Library access removed successfully"
        )
        // Hide success message after 3 seconds
        setTimeout(() => {
          setShowSuccess(false)
        }, 3000)
      } else {
        toast.showError(result.error)
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Failed to unshare library")
    } finally {
      setIsUnsharing(false)
    }
  }

  const stateIcon = isUnsharing ? (
    <Spinner />
  ) : showSuccess ? (
    <Icon icon={Check} className="text-success" />
  ) : (
    <Icon icon={Ban} className="text-destructive" />
  )

  const confirmModal = (
    <ConfirmModal
      isOpen={showConfirmModal}
      onClose={() => setShowConfirmModal(false)}
      onConfirm={handleUnshare}
      title="Unshare Library Access"
      message={`Are you sure you want to remove library access for ${userName || "this user"}? This will revoke their access to the Plex server.`}
      confirmText="Unshare"
      cancelText="Cancel"
      tone="destructive"
    />
  )

  if (inline) {
    return (
      <>
        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={isUnsharing}
          className="w-full flex items-center gap-2 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Unshare library access"
        >
          {stateIcon}
          <span>
            {isUnsharing ? "Unsharing..." : showSuccess ? "Unshared!" : "Unshare Library"}
          </span>
        </button>
        {confirmModal}
      </>
    )
  }

  return (
    <>
      <Button
        variant="destructive"
        size="icon-sm"
        onClick={() => setShowConfirmModal(true)}
        disabled={isUnsharing}
        aria-busy={isUnsharing || undefined}
        aria-label="Unshare library access"
        title="Unshare library access"
      >
        {isUnsharing ? <Spinner /> : <Icon icon={showSuccess ? Check : Ban} />}
      </Button>
      {confirmModal}
    </>
  )
}
