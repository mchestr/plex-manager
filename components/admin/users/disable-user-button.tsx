"use client"

import { setUserDisabled } from "@/actions/admin"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

interface DisableUserButtonProps {
  userId: string
  userName: string | null
  disabled: boolean
}

/** Disables a user's account (ending their sessions), or re-enables it. */
export function DisableUserButton({ userId, userName, disabled }: DisableUserButtonProps) {
  const toast = useToast()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const name = userName || "this user"
  const actionText = disabled ? "Enable account" : "Disable account"

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await setUserDisabled({ userId, disabled: !disabled })
      if (result.success) {
        toast.showSuccess(disabled ? "Account enabled" : "Account disabled")
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update the account")
      }
    })
  }

  return (
    <>
      <Button
        variant={disabled ? "secondary" : "danger"}
        size="sm"
        onClick={() => setShowConfirmModal(true)}
        disabled={isPending}
        data-testid="admin-user-disable-button"
      >
        {isPending ? "Saving..." : actionText}
      </Button>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirm}
        title={actionText}
        message={
          disabled
            ? `${name} will be able to sign in again.`
            : `${name} will be signed out within five minutes and cannot sign in until the account is enabled again.`
        }
        confirmText={disabled ? "Enable" : "Disable"}
        cancelText="Cancel"
        testId="admin-user-disable-dialog"
        confirmTestId="admin-user-disable-confirm"
      />
    </>
  )
}
