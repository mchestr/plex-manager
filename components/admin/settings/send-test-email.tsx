"use client"

import { useTransition } from "react"

import { sendTestEmail } from "@/actions/admin/email"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { icons } from "@/lib/ui/icons"

/** "Send a test email": sends one to the admin's own address on file, and says how it went. */
export function SendTestEmail() {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const send = () =>
    startTransition(async () => {
      const result = await sendTestEmail()
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      toast.showSuccess(result.data.queued ? "Test email queued. It should arrive in a minute." : "Test email sent. Check your inbox.")
    })

  return (
    <Button
      variant="secondary"
      icon={<Icon icon={icons.send} />}
      onClick={send}
      loading={isPending}
      loadingLabel="Sending"
      className="self-start"
      data-testid="settings-email-send-test"
    >
      Send a test email
    </Button>
  )
}
