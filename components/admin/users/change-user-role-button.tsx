"use client"

import { Check, ShieldOff, ShieldPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { updateUserAdminStatus } from "@/actions/admin"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"

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
      <Button
        variant={currentIsAdmin ? "destructive" : "secondary"}
        size="sm"
        onClick={() => setShowConfirmModal(true)}
        loading={isUpdating}
        loadingLabel="Updating..."
        icon={<Icon icon={showSuccess ? Check : currentIsAdmin ? ShieldOff : ShieldPlus} />}
        title={actionText}
      >
        {showSuccess ? "Updated!" : actionText}
      </Button>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleRoleChange}
        title={`${actionText} Privileges`}
        message={confirmMessage}
        confirmText={actionText}
        cancelText="Cancel"
        tone={currentIsAdmin ? "destructive" : "default"}
      />
    </>
  )
}
