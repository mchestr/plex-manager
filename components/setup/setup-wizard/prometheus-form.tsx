"use client"

import { savePrometheus } from "@/actions/setup"
import { WizardFormActions } from "@/components/setup/setup-wizard/wizard-form-actions"
import { type PrometheusInput } from "@/lib/validations/prometheus"
import { useEffect, useRef, useState, useTransition } from "react"
import type { DevDefaults } from "@/types/setup"
import { Input } from "@/components/ui/input"

interface PrometheusFormProps {
  onComplete: () => void
  onBack?: () => void
  /** The DEV_* pre-fill, read once by the setup page. */
  devDefaults: DevDefaults
}

/** Check if all required fields are populated for Prometheus form */
function isFormComplete(data: PrometheusInput): boolean {
  return !!(data.name?.trim() && data.url?.trim() && data.query?.trim())
}

export function PrometheusForm({ onComplete, onBack, devDefaults }: PrometheusFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<PrometheusInput>({
    name: devDefaults.prometheus?.name ?? "",
    url: devDefaults.prometheus?.url ?? "",
    query: devDefaults.prometheus?.query ?? "",
  })
  const autoSubmitTriggered = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Auto-submit when form is fully populated and auto-submit is enabled
  useEffect(() => {
    if (
      devDefaults.autoSubmit &&
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
        <Input
          data-testid="setup-input-name"
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          placeholder="Plex Server"
          className="mt-1"
          aria-invalid={!!errors.name || undefined}
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
        <Input
          data-testid="setup-input-url"
          type="text"
          id="url"
          name="url"
          required
          value={formData.url}
          onChange={handleChange}
          placeholder="http://prometheus.example.com:9090 or http://192.168.1.100:9090"
          className="mt-1"
          aria-invalid={!!errors.url || undefined}
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
        <Input
          data-testid="setup-input-query"
          type="text"
          id="query"
          name="query"
          required
          value={formData.query}
          onChange={handleChange}
          placeholder='up{job="plex"}'
          className="mt-1"
          aria-invalid={!!errors.query || undefined}
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

      <WizardFormActions onBack={onBack} isPending={isPending} isSuccess={isSuccess} />
    </form>
  )
}
