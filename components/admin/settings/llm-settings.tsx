"use client"

import { getConfig, setLLMDisabled } from "@/actions/admin"
import { useToast } from "@/components/ui/toast"
import { useEffect, useState } from "react"

export function LLMSettings() {
  const toast = useToast()
  const [llmDisabled, setLlmDisabled] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await getConfig()
        setLlmDisabled(config.llmDisabled)
        setLastUpdated(config.updatedAt)
        setIsLoading(false)
      } catch (error) {
        console.error("Failed to load config:", error)
        setIsLoading(false)
      }
    }
    loadConfig()
  }, [])

  const handleToggle = async (disabled: boolean) => {
    setIsSaving(true)
    try {
      const result = await setLLMDisabled(disabled)
      if (result.success && result.config) {
        setLlmDisabled(result.config.llmDisabled)
        setLastUpdated(result.config.updatedAt)
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

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="h-10 bg-slate-700 rounded w-24"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">LLM Settings</h2>
          <p className="text-sm text-slate-400">
            {llmDisabled
              ? "LLM calls are disabled. Mock data will be returned instead of making API calls."
              : "LLM calls are enabled. Wrapped content will be generated using the configured LLM provider."}
          </p>
          {lastUpdated && (
            <p className="text-xs text-slate-500 mt-2">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={llmDisabled}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={isSaving}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600 peer-checked:hover:bg-red-700 peer-checked:disabled:bg-red-600/50 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
          <span className="ml-3 text-sm font-medium text-white">
            {llmDisabled ? "LLM Disabled" : "LLM Enabled"}
          </span>
        </label>

        {isSaving && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
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
            Saving...
          </div>
        )}
      </div>

      {llmDisabled && (
        <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/50 rounded-md">
          <p className="text-sm text-yellow-300">
            <strong>Note:</strong> When LLM is disabled, wrapped content will use mock data based on
            statistics. This is useful for development and testing without incurring API costs.
          </p>
        </div>
      )}
    </div>
  )
}

