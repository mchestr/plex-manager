"use client"

import { setLLMDisabled } from "@/actions/admin"
import { useToast } from "@/components/ui/toast"
import { useState } from "react"

interface LLMToggleProps {
  initialDisabled: boolean
}

export function LLMToggle({ initialDisabled }: LLMToggleProps) {
  const toast = useToast()
  const [llmDisabled, setLlmDisabled] = useState<boolean>(initialDisabled)
  const [isSaving, setIsSaving] = useState(false)

  const handleToggle = async (disabled: boolean) => {
    setIsSaving(true)
    try {
      const result = await setLLMDisabled(disabled)
      if (result.success && result.config) {
        setLlmDisabled(result.config.llmDisabled)
        toast.showSuccess(`LLM ${disabled ? "disabled" : "enabled"} successfully`)
      } else {
        toast.showError(result.error || "Failed to update setting")
      }
    } catch (error) {
      console.error("Failed to update config:", error)
      toast.showError("Failed to update setting")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-slate-500">LLM:</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={llmDisabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={isSaving}
          className="sr-only peer"
        />
        <div className="w-7 h-4 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600 peer-checked:hover:bg-red-700 peer-checked:disabled:bg-red-600/50 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
        <span
          className={`ml-2 font-mono text-[10px] ${
            llmDisabled ? "text-red-400" : "text-green-400"
          }`}
        >
          {llmDisabled ? "OFF" : "ON"}
        </span>
      </label>
      {isSaving && (
        <svg
          className="animate-spin h-3 w-3 text-slate-500"
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
      )}
    </span>
  )
}

