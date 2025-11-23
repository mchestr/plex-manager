"use client"

import { getDevDefaults } from "@/actions/dev-defaults"
import { savePlexServer } from "@/actions/setup"
import { StyledInput } from "@/components/ui/styled-input"
import { constructServerUrl } from "@/lib/utils"
import { type PlexServerInput } from "@/lib/validations/plex"
import { memo, useCallback, useEffect, useState, useTransition } from "react"

interface PlexServerFormProps {
  onComplete: () => void
  onBack?: () => void
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

  useEffect(() => {
    // Load dev defaults on mount
    getDevDefaults().then((defaults) => {
      if (defaults.plex) {
        const url = defaults.plex.url || (defaults.plex.hostname && defaults.plex.protocol && defaults.plex.port
          ? constructServerUrl(defaults.plex.protocol, defaults.plex.hostname, defaults.plex.port)
          : "")
        setFormData((prev) => ({
          name: defaults.plex?.name ?? prev.name,
          url: url || prev.url,
          token: defaults.plex?.token ?? prev.token,
          publicUrl: prev.publicUrl,
        }))
      }
    })
  }, [])

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
    <form onSubmit={handleSubmit} className="space-y-6">
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
            disabled={isPending || isSuccess}
            className="inline-flex justify-center rounded-md py-2 px-6 text-sm font-medium text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500"
          >
            {isPending ? "Testing connection..." : isSuccess ? "Success!" : "Continue"}
          </button>
        </div>
      </div>
    </form>
  )
})

