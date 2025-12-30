"use client"

import { getDevDefaults, type DevDefaults } from "@/actions/dev-defaults"
import { fetchLLMModels, saveChatLLMProvider, saveLLMProvider } from "@/actions/setup"
import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/input"
import { StyledDropdown } from "@/components/ui/select"
import { type LLMProviderInput } from "@/lib/validations/llm-provider"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"

interface LLMProviderFormProps {
  purpose: "chat" | "wrapped"
  onComplete: () => void
  onBack?: () => void
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
function isFormComplete(data: LLMProviderInput): boolean {
  return !!(data.provider && data.apiKey?.trim())
}

export function LLMProviderForm({ purpose, onComplete, onBack }: LLMProviderFormProps) {
  const config = PURPOSE_CONFIG[purpose]
  const saveAction = purpose === "chat" ? saveChatLLMProvider : saveLLMProvider
  const [isPending, startTransition] = useTransition()
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formData, setFormData] = useState<LLMProviderInput>(() => ({
    provider: "openai",
    apiKey: "",
    model: "",
    temperature: config.defaultTemperature,
    maxTokens: config.defaultMaxTokens,
  }))
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [devDefaults, setDevDefaults] = useState<DevDefaults | null>(null)
  const autoSubmitTriggered = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Load dev defaults on mount
    getDevDefaults().then((defaults) => {
      setDevDefaults(defaults)
      // Use purpose-specific defaults, falling back to legacy llmProvider
      const llmDefaults = purpose === "chat"
        ? defaults.chatLlmProvider
        : defaults.wrappedLlmProvider

      if (llmDefaults) {
        const provider = llmDefaults.provider ?? "openai"
        const apiKey = llmDefaults.apiKey ?? ""
        const model = llmDefaults.model ?? ""

        setFormData((prev) => ({
          ...prev,
          provider,
          apiKey,
          model,
          temperature: llmDefaults.temperature ?? prev.temperature,
          maxTokens: llmDefaults.maxTokens ?? prev.maxTokens,
        }))

        // If there's a model but it's not in the available models list, use custom input
        if (model && model.trim() !== "") {
          setUseCustomModel(true)
        }
      }
    })
  }, [purpose])

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

  const loadModels = useCallback(async (provider: "openai", apiKey: string) => {
    if (!apiKey || apiKey.trim() === "") {
      setAvailableModels([])
      setModelsError(null)
      return
    }

    setIsLoadingModels(true)
    setModelsError(null)

    try {
      const result = await fetchLLMModels(provider, apiKey)
      if (result.success && result.models) {
        setAvailableModels(result.models)
        setModelsError(null)

        // If current model is in the list, switch to dropdown mode
        if (formData.model && result.models.includes(formData.model)) {
          setUseCustomModel(false)
        }
      } else {
        setAvailableModels([])
        setModelsError(result.error || "Failed to load models")
      }
    } catch (error) {
      setAvailableModels([])
      setModelsError(error instanceof Error ? error.message : "Failed to load models")
    } finally {
      setIsLoadingModels(false)
    }
  }, [formData.model])

  // Load models when provider or API key changes
  useEffect(() => {
    if (formData.apiKey && formData.provider) {
      // Debounce the API call
      const timeoutId = setTimeout(() => {
        loadModels(formData.provider, formData.apiKey)
      }, 500)

      return () => clearTimeout(timeoutId)
    } else {
      setAvailableModels([])
      setModelsError(null)
    }
    return undefined
  }, [formData.provider, formData.apiKey, loadModels])

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
      modelPlaceholder: "gpt-4, gpt-3.5-turbo, etc. (optional)",
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
        <StyledDropdown
          id="provider"
          name="provider"
          value={formData.provider}
          onChange={(value) => {
            setFormData((prev) => {
              const updated = {
                ...prev,
                provider: value as "openai",
              }
              // Reset model when provider changes
              updated.model = ""
              setUseCustomModel(false)
              return updated
            })
          }}
          options={[
            { value: "openai", label: "OpenAI" },
          ]}
          size="md"
          className="mt-1"
        />
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
        <StyledInput
          type="password"
          id="apiKey"
          name="apiKey"
          required
          value={formData.apiKey}
          onChange={handleChange}
          placeholder={`Your ${currentProvider.name} API key`}
          size="md"
          className="mt-1"
          error={!!errors.apiKey}
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
        {!useCustomModel && availableModels.length > 0 ? (
          <StyledDropdown
            id="model"
            name="model"
            value={formData.model || ""}
            onChange={(value) => {
              if (value === "__custom__") {
                setUseCustomModel(true)
                setFormData({ ...formData, model: "" })
              } else {
                setFormData({ ...formData, model: value })
              }
            }}
            options={[
              { value: "", label: "Select a model (optional)" },
              ...availableModels.map((model) => ({ value: model, label: model })),
              { value: "__custom__", label: "Enter custom model..." },
            ]}
            size="md"
            className="mt-1"
          />
        ) : useCustomModel || (formData.apiKey && availableModels.length === 0 && !isLoadingModels) ? (
          <StyledInput
            type="text"
            id="model"
            name="model"
            value={formData.model || ""}
            onChange={handleChange}
            placeholder={currentProvider.modelPlaceholder}
            size="md"
            className="mt-1"
          />
        ) : (
          <div className="mt-1 block w-full rounded-md bg-slate-800/50 border border-slate-600 text-slate-400 shadow-sm sm:text-sm px-3 py-2">
            {isLoadingModels ? "Loading models..." : "Enter API key to see available models"}
          </div>
        )}
        {modelsError && (
          <p className="mt-1 text-xs text-yellow-400">
            {modelsError} - You can still enter a model manually
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {availableModels.length > 0
            ? `Found ${availableModels.length} available model${availableModels.length !== 1 ? "s" : ""}. Select one or enter a custom model name.`
            : "Specify a default model to use. If not provided, a default will be selected automatically."}
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
        <StyledInput
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
          size="md"
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
        <StyledInput
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
          size="md"
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

