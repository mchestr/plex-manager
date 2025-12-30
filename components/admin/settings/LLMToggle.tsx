"use client"

import { setLLMDisabled } from "@/actions/admin"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/sonner"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

interface LLMToggleProps {
  disabled: boolean
}

export function LLMToggle({ disabled }: LLMToggleProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const handleToggle = () => {
    startTransition(async () => {
      const result = await setLLMDisabled(!disabled)
      if (result.success) {
        toast.showSuccess(`LLM ${!disabled ? "disabled" : "enabled"} successfully`)
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update LLM status")
      }
    })
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPending ? "Updating..." : disabled ? "Enable LLM" : "Disable LLM"}
      </Button>
    </div>
  )
}
