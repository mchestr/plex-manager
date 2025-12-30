"use client"

import { getDevDefaults, type DevDefaults } from "@/actions/dev-defaults"
import { saveTautulli } from "@/actions/setup"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/input"
import { type TautulliInput } from "@/lib/validations/tautulli"
import { useEffect, useRef, useState, useTransition } from "react"

interface TautulliFormProps {
  onComplete: () => void
  onBack?: () => void
}

/** Check if all required fields are populated for Tautulli form */
function isFormComplete(data: TautulliInput): boolean {
  return !!(data.name?.trim() && data.url?.trim() && data.apiKey?.trim())
}

export function TautulliForm({ onComplete, onBack }: TautulliFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<TautulliInput>({
    name: "",
    url: "",
    apiKey: "",
    publicUrl: "",
  })
  const [devDefaults, setDevDefaults] = useState<DevDefaults | null>(null)
  const autoSubmitTriggered = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Load dev defaults on mount
    getDevDefaults().then((defaults) => {
      setDevDefaults(defaults)
      if (defaults.tautulli) {
        setFormData((prev) => ({
          name: defaults.tautulli?.name ?? prev.name,
          url: defaults.tautulli?.url ?? prev.url,
          apiKey: defaults.tautulli?.apiKey ?? prev.apiKey,
          publicUrl: defaults.tautulli?.publicUrl ?? prev.publicUrl,
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
      const result = await saveTautulli(formData)
      if (result.success) {
        setIsSuccess(true)
        onComplete()
      } else {
        setErrors({ submit: result.error || "Failed to save Tautulli configuration" })
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
          Tautulli Configuration
        </h2>
        <p className="text-sm text-slate-300 mb-6">
          Enter your Tautulli server connection details. You can find your API key
          in Tautulli settings under the API section.
        </p>
      </div>

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Server Name
        </label>
        <StyledInput
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          placeholder="My Tautulli Server"
          size="md"
          className="mt-1"
          error={!!errors.name}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-400">{errors.name}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="url"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Server URL
        </label>
        <StyledInput
          type="text"
          id="url"
          name="url"
          required
          value={formData.url}
          onChange={handleChange}
          placeholder="http://tautulli.example.com:8181 or http://192.168.1.100:8181"
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
          htmlFor="publicUrl"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Public Server URL <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <StyledInput
          type="text"
          id="publicUrl"
          name="publicUrl"
          value={formData.publicUrl || ""}
          onChange={handleChange}
          placeholder="https://tautulli.example.com"
          size="md"
          className="mt-1"
          error={!!errors.publicUrl}
        />
        <p className="mt-1 text-xs text-slate-400">
          The public URL for Tautulli (for links/redirects)
        </p>
        {errors.publicUrl && (
          <p className="mt-1 text-sm text-red-400">{errors.publicUrl}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="apiKey"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          API Key
        </label>
        <StyledInput
          type="password"
          id="apiKey"
          name="apiKey"
          required
          value={formData.apiKey}
          onChange={handleChange}
          placeholder="Your Tautulli API key"
          size="md"
          className="mt-1"
          error={!!errors.apiKey}
        />
        <p className="mt-1 text-xs text-slate-400">
          Find your API key in Tautulli Settings → API → API Key
        </p>
        {errors.apiKey && (
          <p className="mt-1 text-sm text-red-400">{errors.apiKey}</p>
        )}
      </div>

      {errors.submit && (
        <div className="rounded-md bg-red-900/30 border border-red-500/50 p-4">
          <p className="text-sm text-red-300">{errors.submit}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        {onBack && (
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={isPending || isSuccess}
          >
            Back
          </Button>
        )}
        <div className={onBack ? "ml-auto" : "ml-auto"}>
          <Button
            type="submit"
            data-testid="setup-form-submit"
            disabled={isPending || isSuccess}
          >
            {isPending ? "Testing connection..." : isSuccess ? "Success!" : "Continue"}
          </Button>
        </div>
      </div>
    </form>
  )
}

