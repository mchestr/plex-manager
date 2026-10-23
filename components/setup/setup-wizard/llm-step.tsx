"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { saveChatLLMProvider, saveLLMProvider } from "@/actions/setup"
import { LLMModelPicker } from "@/components/admin/settings/llm-model-picker"
import { SetupStepFrame } from "@/components/setup/setup-wizard/setup-step-frame"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { listKnownModels } from "@/lib/llm/models"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import { nextStepId, type DevDefaults, type SetupStoredLLM } from "@/types/setup"

const COPY = {
  wrapped: {
    position: "llm-rewind",
    heading: "Choose the Rewind writer",
    description: "The OpenAI model that writes each member's Rewind. You can switch to another provider later in Admin settings.",
  },
  chat: {
    position: "llm-chat",
    heading: "Choose the admin assistant",
    description: "The OpenAI model behind the admin assistant, which answers questions about the server. Other providers are in Admin settings.",
  },
} as const

const CATALOGUE = listKnownModels("openai").map((info) => info.id)

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

interface LLMStepProps {
  purpose: "wrapped" | "chat"
  stored: SetupStoredLLM | null
  devDefaults: DevDefaults
}

/**
 * The Rewind writer and admin assistant steps: an OpenAI key as a
 * `SecretInput` (saved state on a revisit; a blank key keeps it) and the
 * settings' model picker. Setup stays OpenAI-only: an OpenAI-compatible
 * address is for Admin settings (SEC-44).
 */
export function LLMStep({ purpose, stored, devDefaults }: LLMStepProps) {
  const router = useRouter()
  const copy = COPY[purpose]
  const dev = purpose === "chat" ? devDefaults.chatLlmProvider : devDefaults.wrappedLlmProvider
  const initialModel = stored?.model ?? dev?.model ?? DEFAULT_OPENAI_MODEL
  const [apiKey, setApiKey] = useState(stored ? "" : (dev?.apiKey ?? ""))
  const [model, setModel] = useState({ id: initialModel, custom: !CATALOGUE.includes(initialModel) })
  const [temperature, setTemperature] = useState((stored?.temperature ?? dev?.temperature)?.toString() ?? "")
  const [maxTokens, setMaxTokens] = useState((stored?.maxTokens ?? dev?.maxTokens)?.toString() ?? "")
  const [errors, setErrors] = useState<{ apiKey?: string; model?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const submit = () =>
    startSave(async () => {
      if (!model.id.trim()) {
        setErrors({ model: "Choose a model" })
        return
      }
      const save = purpose === "chat" ? saveChatLLMProvider : saveLLMProvider
      const result = await save({
        provider: "openai",
        apiKey: apiKey.trim() || undefined,
        model: model.id.trim(),
        temperature: optionalNumber(temperature),
        maxTokens: optionalNumber(maxTokens),
      })
      if (result.success) {
        router.push(`/setup?step=${nextStepId(copy.position)}`)
        return
      }
      const apiKeyError = result.fieldErrors?.apiKey?.[0]
      setErrors(apiKeyError ? { apiKey: apiKeyError } : {})
      setFormError(apiKeyError ? null : result.error)
    })

  return (
    <SetupStepFrame
      position={copy.position}
      heading={copy.heading}
      description={copy.description}
      onSubmit={submit}
      busy={saving}
      primary={
        <Button type="submit" loading={saving} loadingLabel="Saving" data-testid="setup-form-submit">
          Save and continue
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField name={`setup-${purpose}-api-key`} label="OpenAI API key" error={errors.apiKey} className="md:col-span-2">
          <SecretInput
            value={apiKey}
            onValueChange={(value) => {
              setApiKey(value)
              setErrors((prev) => ({ ...prev, apiKey: undefined }))
            }}
            saved={stored?.secret}
            placeholder="sk-..."
            required
            disabled={saving}
            data-testid={`setup-${copy.position}-api-key`}
          />
        </FormField>
        <FormField name={`setup-${purpose}-model`} label="Model" error={errors.model} className="md:col-span-2">
          <LLMModelPicker provider="openai" model={model.id} custom={model.custom} liveModels={null} onChange={(id, custom) => setModel({ id, custom })} disabled={saving} />
        </FormField>
        <FormField name={`setup-${purpose}-temperature`} label="Temperature" optional description="From 0.0 to 2.0, for models that take one.">
          <Input type="number" min="0" max="2" step="0.1" value={temperature} onValueChange={setTemperature} placeholder="Model default" disabled={saving} data-testid={`setup-${copy.position}-temperature`} />
        </FormField>
        <FormField name={`setup-${purpose}-max-tokens`} label="Max tokens" optional description="From 1 to 100,000.">
          <Input type="number" min="1" max="100000" step="1" value={maxTokens} onValueChange={setMaxTokens} placeholder="Default" disabled={saving} data-testid={`setup-${copy.position}-max-tokens`} />
        </FormField>
        {formError && (
          <Alert tone="destructive" className="md:col-span-2" data-testid={`setup-${copy.position}-error`}>
            {formError}
          </Alert>
        )}
      </div>
    </SetupStepFrame>
  )
}
