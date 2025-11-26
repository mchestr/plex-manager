"use client"

import { saveDiscordIntegration } from "@/actions/setup"
import { StyledInput } from "@/components/ui/styled-input"
import { type DiscordIntegrationInput } from "@/lib/validations/discord"
import { useCallback, useState, useTransition } from "react"

interface DiscordIntegrationFormProps {
  onComplete: () => void
  onBack?: () => void
}

type DiscordFormState = Omit<DiscordIntegrationInput, "isEnabled"> & {
  isEnabled: boolean
  instructions?: string
}

export function DiscordIntegrationForm({ onComplete, onBack }: DiscordIntegrationFormProps) {
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<DiscordFormState>({
    isEnabled: false,
    clientId: "",
    clientSecret: "",
    guildId: "",
    metadataKey: "is_subscribed",
    metadataValue: "true",
    platformName: "Plex Wrapped",
    instructions: "",
    botSharedSecret: "",
  })

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }))
    },
    []
  )

  const handleSecretGenerate = () => {
    try {
      const secret = crypto.randomUUID().replace(/-/g, "")
      setFormData((prev) => ({
        ...prev,
        botSharedSecret: secret,
      }))
    } catch {
      const fallback = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 36).toString(36)
      ).join("")
      setFormData((prev) => ({
        ...prev,
        botSharedSecret: fallback,
      }))
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrors({})

    if (formData.isEnabled && (!formData.clientId?.trim() || !formData.clientSecret?.trim())) {
      setErrors({
        submit: "Client ID and Client Secret are required when enabling Discord integration.",
      })
      return
    }

    startTransition(async () => {
      const payload = {
        ...formData,
        clientId: formData.clientId?.trim() || undefined,
        clientSecret: formData.clientSecret?.trim() || undefined,
        guildId: formData.guildId?.trim() || undefined,
        metadataKey: formData.metadataKey?.trim() || "",
        metadataValue: formData.metadataValue?.trim() || "",
        platformName: formData.platformName?.trim() || "",
        instructions: formData.instructions?.trim() || undefined,
        botSharedSecret: formData.botSharedSecret?.trim() || undefined,
        isEnabled: formData.isEnabled,
      }

      const result = await saveDiscordIntegration(payload)
      if (result.success) {
        setIsSuccess(true)
        onComplete()
      } else {
        setErrors({
          submit: result.error || "Failed to save Discord integration settings",
        })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">Discord Linked Roles</h2>
        <p className="text-sm text-slate-300 mb-6">
          Connect your Discord application so community members can verify Plex access using
          Discord Linked Roles. Once enabled, these values drive both the public link portal and the
          bot verification endpoint.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFormData((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))}
          data-testid="setup-discord-toggle"
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            formData.isEnabled ? "bg-cyan-500" : "bg-slate-600"
          }`}
          aria-pressed={formData.isEnabled}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              formData.isEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm text-white">
          {formData.isEnabled ? "Discord integration enabled" : "Discord integration disabled"}
        </span>
      </div>
      {formData.isEnabled && (
        <p className="text-xs text-slate-400">
          Users will be redirected to Discord to link their accounts when this is enabled.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-cyan-400 mb-2">
            Client ID {formData.isEnabled && <span className="text-red-400">*</span>}
          </label>
          <StyledInput
            type="text"
            name="clientId"
            value={formData.clientId}
            onChange={handleChange}
            placeholder="Discord application client ID"
            required={formData.isEnabled}
            disabled={isPending}
            size="md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-400 mb-2">
            Client Secret {formData.isEnabled && <span className="text-red-400">*</span>}
          </label>
          <StyledInput
            type="password"
            name="clientSecret"
            value={formData.clientSecret}
            onChange={handleChange}
            placeholder="Discord application client secret"
            required={formData.isEnabled}
            disabled={isPending}
            size="md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-400 mb-2">
            Guild ID <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <StyledInput
            type="text"
            name="guildId"
            value={formData.guildId}
            onChange={handleChange}
            placeholder="Discord server/guild ID"
            disabled={isPending}
            size="md"
          />
          <p className="mt-1 text-xs text-slate-400">
            Provide this to limit linking to a single Discord server.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-400 mb-2">
            Platform Name <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <StyledInput
            type="text"
            name="platformName"
            value={formData.platformName}
            onChange={handleChange}
            placeholder="Shown in Discord profile (e.g. Plex Wrapped)"
            disabled={isPending}
            size="md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-400 mb-2">Metadata Key</label>
          <StyledInput
            type="text"
            name="metadataKey"
            value={formData.metadataKey}
            onChange={handleChange}
            placeholder="is_subscribed"
            disabled={isPending}
            size="md"
          />
          <p className="mt-1 text-xs text-slate-400">
            Must match the metadata key you configured in Discord Linked Roles.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-cyan-400 mb-2">Metadata Value</label>
          <StyledInput
            type="text"
            name="metadataValue"
            value={formData.metadataValue}
            onChange={handleChange}
            placeholder="true"
            disabled={isPending}
            size="md"
          />
          <p className="mt-1 text-xs text-slate-400">
            Value applied when Plex access is verified.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-cyan-400 mb-2">
            Bot Shared Secret <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <div className="flex gap-2">
            <StyledInput
              type="text"
              name="botSharedSecret"
              value={formData.botSharedSecret}
              onChange={handleChange}
              placeholder="Secret used when your bot calls the verification API"
              disabled={isPending}
              size="md"
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleSecretGenerate}
              className="px-3 py-2 text-xs font-medium rounded-md border border-slate-600 bg-slate-800/70 text-slate-200 hover:text-white hover:border-cyan-400 transition-colors"
              disabled={isPending}
            >
              Generate
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Send this value in the <code className="font-mono">X-PlexWrapped-Bot-Key</code> header
            when calling the verification endpoint.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-cyan-400 mb-2">
          Internal Instructions <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          name="instructions"
          value={formData.instructions}
          onChange={handleChange}
          placeholder="Share notes for other admins on how to deploy and test the Discord bot."
          disabled={isPending}
          className="w-full min-h-[120px] rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400 resize-none"
        />
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
            {isPending ? "Saving settings..." : isSuccess ? "Success!" : "Continue"}
          </button>
        </div>
      </div>
    </form>
  )
}


