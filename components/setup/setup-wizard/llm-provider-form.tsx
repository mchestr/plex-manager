"use client"

import { saveChatLLMProvider, saveLLMProvider } from "@/actions/setup"
import { WizardFormActions } from "@/components/setup/setup-wizard/wizard-form-actions"
import { listKnownModels } from "@/lib/llm/models"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import { type SetupLLMProviderInput } from "@/lib/validations/llm-provider"
import { useEffect, useRef, useState, useTransition } from "react"
import type { DevDefaults } from "@/types/setup"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PROVIDER_ITEMS: { value: "openai"; label: string }[] = [{ value: "openai", label: "OpenAI" }]
const CUSTOM_MODEL = "__custom__"

interface LLMProviderFormProps {
  purpose: "chat" | "wrapped"
  onComplete: () => void
  onBack?: () => void
  /** The DEV_* pre-fill, read once by the setup page. */
  devDefaults: DevDefaults
}

const PURPOSE_CONFIG = {
  chat: {
    title: "Chat Assistant AI Configuration",
    description: "Configure the model that powers the admin troubleshooting chatbot.",
    temperatureLabel: "Temperature (0.0-2.0)",
    defaultTemperature: 0.7,
    defaultMaxTokens: 1000,
    providerDescription: "Configure OpenAI for the real-time chatbot experience.",
  },
  wrapped: {
    title: "Wrapped Generation AI Configuration",
    description: "Configure the model that writes Plex Wrapped summaries and stories.",
    temperatureLabel: "Temperature (0.0-2.0)",
    defaultTemperature: 0.8,
    defaultMaxTokens: 6000,
    providerDescription: "Configure OpenAI for Plex Wrapped generation.",
  },
} as const

/** Check if all required fields are populated for LLM form */
function isFormComplete(data: SetupLLMProviderInput): boolean {
  return !!(data.provider && data.apiKey?.trim())
}

/** The OpenAI models from the static catalogue (P10.7): choosing one asks the provider for nothing. */
const CATALOGUE_MODELS = listKnownModels("openai").map((info) => info.id)
const modelItems = [
  { value: "", label: "Select a model (optional)" },
  ...CATALOGUE_MODELS.map((model) => ({ value: model, label: model })),
  { value: CUSTOM_MODEL, label: "Enter custom model..." },
]

export function LLMProviderForm({ purpose, onComplete, onBack, devDefaults }: LLMProviderFormProps) {
  const config = PURPOSE_CONFIG[purpose]
  const saveAction = purpose === "chat" ? saveChatLLMProvider : saveLLMProvider
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Purpose-specific DEV_* defaults
  const llmDefaults = purpose === "chat" ? devDefaults.chatLlmProvider : devDefaults.wrappedLlmProvider
  const [formData, setFormData] = useState<SetupLLMProviderInput>(() => ({
    provider: llmDefaults?.provider ?? "openai",
    apiKey: llmDefaults?.apiKey ?? "",
    model: llmDefaults?.model ?? "",
    temperature: llmDefaults?.temperature ?? config.defaultTemperature,
    maxTokens: llmDefaults?.maxTokens ?? config.defaultMaxTokens,
  }))
  // A pre-filled model outside the catalogue shows in the custom field
  const [useCustomModel, setUseCustomModel] = useState(() => Boolean(llmDefaults?.model?.trim()) && !CATALOGUE_MODELS.includes(llmDefaults?.model ?? ""))
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
      const result = await saveAction(formData)
      if (result.success) {
        setIsSuccess(true)
        onComplete()
      } else {
        setErrors({ submit: result.error || "Failed to save LLM provider configuration" })
      }
    })
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      }
      // Reset model when provider changes
      if (name === "provider") {
        updated.model = ""
        setUseCustomModel(false)
      }
      return updated
    })
  }

  const providerInfo = {
    openai: {
      name: "OpenAI",
      description: config.providerDescription,
      apiKeyHelp: "Get your API key from https://platform.openai.com/api-keys",
      modelPlaceholder: `${DEFAULT_OPENAI_MODEL} (default), gpt-6-luna, etc. (optional)`,
    },
  }

  const currentProvider = providerInfo[formData.provider]

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          {config.title}
        </h2>
        <p className="text-sm text-slate-300 mb-6">
          {config.description}
        </p>
      </div>

      <div>
        <label
          htmlFor="provider"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Provider
        </label>
        <Select
          items={PROVIDER_ITEMS}
          value={formData.provider}
          onValueChange={(value) => {
            if (value === null) return
            setFormData((prev) => ({ ...prev, provider: value, model: "" }))
            setUseCustomModel(false)
          }}
        >
          <SelectTrigger id="provider" className="mt-1" data-testid="setup-input-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`setup-input-provider-option-${item.value}`}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-slate-400">
          OpenAI is currently the supported provider for this experience.
        </p>
      </div>

      <div>
        <label
          htmlFor="apiKey"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          API Key
        </label>
        <Input
          data-testid="setup-input-apiKey"
          type="password"
          id="apiKey"
          name="apiKey"
          required
          value={formData.apiKey}
          onChange={handleChange}
          placeholder={`Your ${currentProvider.name} API key`}
          className="mt-1"
          aria-invalid={!!errors.apiKey || undefined}
        />
        <p className="mt-1 text-xs text-slate-400">
          {currentProvider.apiKeyHelp}
        </p>
        {errors.apiKey && (
          <p className="mt-1 text-sm text-red-400">{errors.apiKey}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="model"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Default Model <span className="text-slate-500 text-xs">(Optional)</span>
        </label>
        {!useCustomModel && CATALOGUE_MODELS.length > 0 ? (
          <Select
            items={modelItems}
            value={formData.model || ""}
            onValueChange={(value) => {
              if (value === CUSTOM_MODEL) {
                setUseCustomModel(true)
                setFormData({ ...formData, model: "" })
              } else {
                setFormData({ ...formData, model: value ?? "" })
              }
            }}
          >
            <SelectTrigger id="model" className="mt-1" data-testid="setup-input-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelItems.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`setup-input-model-option-${item.value}`}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            data-testid="setup-input-model"
            type="text"
            id="model"
            name="model"
            value={formData.model || ""}
            onChange={handleChange}
            placeholder={currentProvider.modelPlaceholder}
            className="mt-1"
          />
        )}
        <p className="mt-1 text-xs text-slate-400">
          Select a model or enter a custom model name. If you leave it empty, a default is chosen.
        </p>
        {errors.model && (
          <p className="mt-1 text-sm text-red-400">{errors.model}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="temperature"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          {config.temperatureLabel}{" "}
          <span className="text-slate-500 text-xs">(Optional, default: {config.defaultTemperature})</span>
        </label>
        <Input
          data-testid="setup-input-temperature"
          type="number"
          id="temperature"
          name="temperature"
          min="0"
          max="2"
          step="0.1"
          value={formData.temperature ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              temperature: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          placeholder={config.defaultTemperature.toString()}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-slate-400">
          Controls randomness (0.0-2.0). Higher values make output more random. Note: GPT-5 models only support temperature 1 (default).
        </p>
      </div>

      <div>
        <label
          htmlFor="maxTokens"
          className="block text-sm font-medium text-cyan-400 mb-2"
        >
          Max Tokens <span className="text-slate-500 text-xs">(Optional, default: {config.defaultMaxTokens})</span>
        </label>
        <Input
          data-testid="setup-input-maxTokens"
          type="number"
          id="maxTokens"
          name="maxTokens"
          min="1"
          max="100000"
          step="1"
          value={formData.maxTokens ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              maxTokens: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          placeholder={config.defaultMaxTokens.toString()}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-slate-400">
          Maximum number of tokens to generate in the response (1-100000). Higher values allow longer responses but cost more.
        </p>
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

