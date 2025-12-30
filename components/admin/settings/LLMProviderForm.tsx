"use client"

import { updateChatLLMProvider, updateWrappedLLMProvider } from "@/actions/admin"
import { Button } from "@/components/ui/button"
import { StyledDropdown } from "@/components/ui/select"
import { StyledInput } from "@/components/ui/input"
import { useToast } from "@/components/ui/sonner"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

interface LLMProviderFormProps {
  provider: { provider: string; model: string | null; apiKey: string; temperature: number | null; maxTokens: number | null } | null
  purpose: "chat" | "wrapped"
}

export function LLMProviderForm({ provider, purpose }: LLMProviderFormProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const [formData, setFormData] = useState({
    provider: provider?.provider || "openai",
    apiKey: provider?.apiKey || "",
    model: provider?.model || "",
    temperature: provider?.temperature ?? (purpose === "chat" ? 0.7 : 0.8),
    maxTokens: provider?.maxTokens ?? (purpose === "chat" ? 1000 : 6000),
  })

  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [useCustomModel, setUseCustomModel] = useState(false)

  // Load models from pricing API when editing
  useEffect(() => {
    if (isEditing && formData.provider === "openai") {
      setIsLoadingModels(true)
      setModelsError(null)

      fetch("/api/admin/models")
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch models")
          }
          const data = await res.json()
          if (data.models && Array.isArray(data.models)) {
            setAvailableModels(data.models)
            setModelsError(null)

            // If current model is in the list, switch to dropdown mode
            if (formData.model && data.models.includes(formData.model)) {
              setUseCustomModel(false)
            }
          } else {
            throw new Error("Invalid response format")
          }
        })
        .catch((error) => {
          setAvailableModels([])
          setModelsError(error instanceof Error ? error.message : "Failed to load models")
        })
        .finally(() => {
          setIsLoadingModels(false)
        })
    } else {
      setAvailableModels([])
      setModelsError(null)
    }
  }, [isEditing, formData.provider, formData.model])

  // Initialize useCustomModel based on whether current model is in available models
  useEffect(() => {
    if (formData.model && availableModels.length > 0) {
      setUseCustomModel(!availableModels.includes(formData.model))
    } else if (!formData.model) {
      setUseCustomModel(false)
    }
  }, [formData.model, availableModels])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.model) {
      toast.showError("Model is required")
      return
    }

    startTransition(async () => {
      const updateFn = purpose === "chat" ? updateChatLLMProvider : updateWrappedLLMProvider
      const result = await updateFn({
        provider: formData.provider,
        apiKey: formData.apiKey,
        model: formData.model!,
        temperature: formData.temperature,
        maxTokens: formData.maxTokens,
      })

      if (result.success) {
        setIsEditing(false)
        toast.showSuccess(`${purpose === "chat" ? "Chat" : "Wrapped"} LLM provider updated successfully`)
        router.refresh()
      } else {
        toast.showError(result.error || `Failed to update ${purpose} LLM provider`)
      }
    })
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {provider ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Provider</div>
                <div className="text-sm text-white">
                  <span className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs font-medium">
                    {provider.provider.toUpperCase()}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Model</div>
                <div className="text-sm text-white font-mono">
                  {provider.model || "Not configured"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Temperature</div>
                <div className="text-sm text-white">
                  {provider.temperature ?? `Default (${purpose === "chat" ? "0.7" : "0.8"})`}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-1">Max Tokens</div>
                <div className="text-sm text-white">
                  {provider.maxTokens ?? `Default (${purpose === "chat" ? "1000" : "6000"})`}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">No LLM provider configured</div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="ml-4"
        >
          Edit
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Provider</label>
          <StyledDropdown
            value={formData.provider}
            onChange={(value) => setFormData({ ...formData, provider: value })}
            options={[
              { value: "openai", label: "OpenAI" },
            ]}
            size="md"
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Model <span className="text-red-400">*</span></label>
          {!useCustomModel && availableModels.length > 0 ? (
            <StyledDropdown
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
                { value: "", label: "Select a model" },
                ...availableModels.map((model) => ({ value: model, label: model })),
                { value: "__custom__", label: "Enter custom model..." },
              ]}
              size="md"
            />
          ) : useCustomModel || (formData.apiKey && availableModels.length === 0 && !isLoadingModels) ? (
            <StyledInput
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="gpt-4, gpt-3.5-turbo, etc."
              required
              disabled={isPending}
            />
          ) : (
            <div className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2 text-sm text-slate-400">
              {isLoadingModels ? "Loading models..." : "Available models"}
            </div>
          )}
          {modelsError && (
            <p className="mt-1 text-xs text-yellow-400">
              {modelsError} - You can still enter a model manually
            </p>
          )}
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-400 mb-1">API Key</label>
          <StyledInput
            type="password"
            value={formData.apiKey}
            onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
            placeholder="sk-..."
            required
            disabled={isPending}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Temperature (0.0-2.0)
            <span className="text-slate-500 ml-1">(optional, default: {purpose === "chat" ? "0.7" : "0.8"})</span>
          </label>
          <StyledInput
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={formData.temperature}
            onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) || (purpose === "chat" ? 0.7 : 0.8) })}
            placeholder={purpose === "chat" ? "0.7" : "0.8"}
            disabled={isPending}
          />
          <p className="mt-1 text-xs text-slate-500">
            Note: GPT-5 models only support temperature 1 (default)
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            Max Tokens (1-100000)
            <span className="text-slate-500 ml-1">(optional, default: {purpose === "chat" ? "1000" : "6000"})</span>
          </label>
          <StyledInput
            type="number"
            min="1"
            max="100000"
            step="1"
            value={formData.maxTokens}
            onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || (purpose === "chat" ? 1000 : 6000) })}
            placeholder={purpose === "chat" ? "1000" : "6000"}
            disabled={isPending}
          />
          <p className="mt-1 text-xs text-slate-500">
            Maximum number of tokens to generate in the response
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isPending}
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setIsEditing(false)
            setFormData({
              provider: provider?.provider || "openai",
              apiKey: provider?.apiKey || "",
              model: provider?.model || "",
              temperature: provider?.temperature ?? (purpose === "chat" ? 0.7 : 0.8),
              maxTokens: provider?.maxTokens ?? (purpose === "chat" ? 1000 : 6000),
            })
            setAvailableModels([])
            setModelsError(null)
            setUseCustomModel(false)
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
