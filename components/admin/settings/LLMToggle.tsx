"use client"

import { setLLMDisabled } from "@/actions/admin"
import { useToast } from "@/components/ui/toast"
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
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-cyan-500/50 text-slate-300 hover:text-white text-xs font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
      >
        {isPending ? "Updating..." : disabled ? "Enable LLM" : "Disable LLM"}
      </button>
    </div>
  )
}
