"use client"

import { getDevDefaults, type DevDefaults } from "@/actions/dev-defaults"
import { savePlexServer } from "@/actions/setup"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/input"
import { type PlexServerInput } from "@/lib/validations/plex"
import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react"

interface PlexServerFormProps {
  onComplete: () => void
  onBack?: () => void
}

/** Check if all required fields are populated for Plex form */
function isFormComplete(data: PlexServerInput): boolean {
  return !!(data.name?.trim() && data.url?.trim() && data.token?.trim())
}

export const PlexServerForm = memo(function PlexServerForm({ onComplete, onBack }: PlexServerFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<PlexServerInput>({
    name: "",
    url: "",
    token: "",
    publicUrl: "",
  })
  const [devDefaults, setDevDefaults] = useState<DevDefaults | null>(null)
  const autoSubmitTriggered = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Load dev defaults on mount
    getDevDefaults().then((defaults) => {
      setDevDefaults(defaults)
      if (defaults.plex) {
        setFormData((prev) => ({
          name: defaults.plex?.name ?? prev.name,
          url: defaults.plex?.url ?? prev.url,
          token: defaults.plex?.token ?? prev.token,
          publicUrl: defaults.plex?.publicUrl ?? prev.publicUrl,
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
      // Brief delay to show the populated form
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
      const result = await savePlexServer(formData)
      if (result.success) {
        setIsSuccess(true)
        onComplete()
      } else {
        setErrors({ submit: result.error || "Failed to save Plex server configuration" })
      }
    })
  }

  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }, [])

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          Plex Server Configuration
        </h2>
        <p className="text-sm text-slate-300 mb-6">
          Enter your Plex server connection details. You can find your Plex
          token in your Plex account settings.
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
          placeholder="My Plex Server"
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
          placeholder="https://plex.example.com:32400 or http://192.168.1.100:32400"
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
          placeholder="https://plex.example.com"
          size="md"
          className="mt-1"
          error={!!errors.publicUrl}
        />
        <p className="mt-1 text-xs text-slate-400">
          The public URL your users use to access Plex (for links/redirects)
        </p>
        {errors.publicUrl && (
          <p className="mt-1 text-sm text-red-400">{errors.publicUrl}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="token"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Plex Token
        </label>
        <StyledInput
          type="password"
          id="token"
          name="token"
          required
          value={formData.token}
          onChange={handleChange}
          placeholder="Your Plex authentication token"
          size="md"
          className="mt-1"
          error={!!errors.token}
        />
        <p className="mt-1 text-xs text-slate-400">
          Find your token at{" "}
          <a
            href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline transition-colors"
          >
            Plex Support
          </a>
        </p>
        {errors.token && (
          <p className="mt-1 text-sm text-red-400">{errors.token}</p>
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
})

