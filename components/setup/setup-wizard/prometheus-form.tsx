"use client"

import { getDevDefaults, type DevDefaults } from "@/actions/dev-defaults"
import { savePrometheus } from "@/actions/setup"
import { StyledInput } from "@/components/ui/input"
import { type PrometheusInput } from "@/lib/validations/prometheus"
import { useEffect, useRef, useState, useTransition } from "react"

interface PrometheusFormProps {
  onComplete: () => void
  onBack?: () => void
}

/** Check if all required fields are populated for Prometheus form */
function isFormComplete(data: PrometheusInput): boolean {
  return !!(data.name?.trim() && data.url?.trim() && data.query?.trim())
}

export function PrometheusForm({ onComplete, onBack }: PrometheusFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<PrometheusInput>({
    name: "",
    url: "",
    query: "",
  })
  const [devDefaults, setDevDefaults] = useState<DevDefaults | null>(null)
  const autoSubmitTriggered = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Load dev defaults on mount
    getDevDefaults().then((defaults) => {
      setDevDefaults(defaults)
      if (defaults.prometheus) {
        setFormData((prev) => ({
          name: defaults.prometheus?.name ?? prev.name,
          url: defaults.prometheus?.url ?? prev.url,
          query: defaults.prometheus?.query ?? prev.query,
        }))
      }
    })
  }, [])

  // Auto-submit when form is fully populated and auto-submit is enabled
  useEffect(() => {
    if (
      devDefaults?.autoSubmit &&
      isFormComplete(formData) &&
      !autoSubmitTriggered.current &&
      !isPending &&
      !isSuccess
    ) {
      autoSubmitTriggered.current = true
      const timer = setTimeout(() => {
        formRef.current?.requestSubmit()
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [devDefaults, formData, isPending, isSuccess])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrors({})

    startTransition(async () => {
      const result = await savePrometheus(formData)
      if (result.success) {
        setIsSuccess(true)
        onComplete()
      } else {
        setErrors({ submit: result.error || "Failed to save Prometheus configuration" })
      }
    })
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          Prometheus Configuration
        </h2>
        <p className="text-sm text-slate-300 mb-6">
          Configure Prometheus to display server status on the homepage.
          Enter your Prometheus server URL and a PromQL query that returns data when the service is up.
        </p>
      </div>

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Service Name
        </label>
        <StyledInput
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          placeholder="Plex Server"
          size="md"
          className="mt-1"
          error={!!errors.name}
        />
        <p className="mt-1 text-xs text-slate-400">
          Display name for the service being monitored
        </p>
        {errors.name && (
          <p className="mt-1 text-sm text-red-400">{errors.name}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="url"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Prometheus URL
        </label>
        <StyledInput
          type="text"
          id="url"
          name="url"
          required
          value={formData.url}
          onChange={handleChange}
          placeholder="http://prometheus.example.com:9090 or http://192.168.1.100:9090"
          size="md"
          className="mt-1"
          error={!!errors.url}
        />
        <p className="mt-1 text-xs text-slate-400">
          Include protocol (http:// or https://) and port number
        </p>
        {errors.url && (
          <p className="mt-1 text-sm text-red-400">{errors.url}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="query"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          PromQL Query
        </label>
        <StyledInput
          type="text"
          id="query"
          name="query"
          required
          value={formData.query}
          onChange={handleChange}
          placeholder='up{job="plex"}'
          size="md"
          className="mt-1"
          error={!!errors.query}
        />
        <p className="mt-1 text-xs text-slate-400">
          Query that returns data when the service is up (e.g., up&#123;job=&quot;plex&quot;&#125;)
        </p>
        {errors.query && (
          <p className="mt-1 text-sm text-red-400">{errors.query}</p>
        )}
      </div>

      {errors.submit && (
        <div className="rounded-md bg-red-900/30 border border-red-500/50 p-4">
          <p className="text-sm text-red-300">{errors.submit}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={isPending || isSuccess}
            className="inline-flex justify-center rounded-md border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 py-2 px-6 text-sm font-medium text-slate-200 shadow-lg hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 hover:border-slate-500"
          >
            Back
          </button>
        )}
        <div className={onBack ? "ml-auto" : "ml-auto"}>
          <button
            type="submit"
            data-testid="setup-form-submit"
            disabled={isPending || isSuccess}
            className="inline-flex justify-center rounded-md py-2 px-6 text-sm font-medium text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500"
          >
            {isPending ? "Testing connection..." : isSuccess ? "Success!" : "Continue"}
          </button>
        </div>
      </div>
    </form>
  )
}
