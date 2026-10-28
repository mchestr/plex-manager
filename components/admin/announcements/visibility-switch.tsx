"use client"

import { useOptimistic, useTransition } from "react"

import { setAnnouncementActive } from "@/actions/announcements"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface VisibilitySwitchProps {
  id: string
  title: string
  isActive: boolean
}

/**
 * "Visible on home page" for one row (P10.5). The switch moves at once
 * (`useOptimistic`); a failed save shows the error and the switch falls back
 * to the saved state when the transition ends.
 */
export function VisibilitySwitch({ id, title, isActive }: VisibilitySwitchProps) {
  const { showSuccess, showError } = useToast()
  const [visible, setVisible] = useOptimistic(isActive)
  const [pending, startTransition] = useTransition()

  const onCheckedChange = (next: boolean) =>
    startTransition(async () => {
      setVisible(next)
      const result = await setAnnouncementActive({ id, isActive: next })
      if (result.success) showSuccess(next ? `"${title}" shows on the home page` : `"${title}" is hidden`)
      else showError(result.error)
    })

  return (
    <Switch
      checked={visible}
      onCheckedChange={onCheckedChange}
      disabled={pending}
      label={`Visible on home page: ${title}`}
      data-testid={`toggle-announcement-${id}`}
    />
  )
}
