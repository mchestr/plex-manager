import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { listLLMModels, updateChatLLMProvider, updateWrappedLLMProvider } from "@/actions/admin"
import type { TestResult } from "@/components/ui/settings-section"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { listKnownModels, lookupModel, type EffortLevel, type LLMProviderId } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"

/** The active provider row as the settings page sends it, without the key. */
export interface StoredLLMProvider {
  provider: string
  model: string | null
  /** A key is stored (never the value itself). */
  hasApiKey: boolean
  baseUrl: string | null
  effort: string | null
  temperature: number | null
  maxTokens: number | null
}

export interface LLMFormState {
  provider: LLMProviderId
  apiKey: string
  baseUrl: string
  model: string
  custom: boolean
  effort: string
  temperature: string
  maxTokens: string
}

function initialState(stored: StoredLLMProvider | null): LLMFormState {
  const provider = stored && isLLMProviderId(stored.provider) ? stored.provider : "openai"
  const model = stored?.model ?? ""
  const known = listKnownModels(provider).some((info) => info.id === model)
  return {
    provider,
    apiKey: "",
    baseUrl: stored?.baseUrl ?? "",
    model,
    custom: Boolean(model) && !known,
    effort: stored?.effort ?? "",
    temperature: stored?.temperature?.toString() ?? "",
    maxTokens: stored?.maxTokens?.toString() ?? "",
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function listRequest(purpose: "chat" | "wrapped", state: LLMFormState) {
  return {
    purpose,
    provider: state.provider,
    apiKey: state.apiKey.trim() || undefined,
    baseUrl: state.provider === "openai-compatible" ? state.baseUrl : undefined,
  }
}

/**
 * State and actions of one purpose's LLM provider form, always open (UI-31):
 * the fields and their dirty state, which settings the chosen model takes,
 * whether the stored key can be reused, the provider's model list, Test and
 * Save. The AI settings section holds one per purpose.
 */
export function useLLMProviderForm(stored: StoredLLMProvider | null, purpose: "chat" | "wrapped") {
  const router = useRouter()
  const toast = useToast()
  const [liveModels, setLiveModels] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const settings = useSettingsForm(initialState(stored), async (form) => {
    if (!form.model.trim()) {
      toast.showError("Model is required")
      return
    }
    const info = lookupModel(form.provider, form.model)
    const levels = info?.capabilities.effortLevels ?? null
    const action = purpose === "chat" ? updateChatLLMProvider : updateWrappedLLMProvider
    const result = await action({
      provider: form.provider,
      // A blank key keeps the stored one when the action allows it
      apiKey: form.apiKey.trim() || undefined,
      baseUrl: form.provider === "openai-compatible" ? form.baseUrl : undefined,
      model: form.model.trim(),
      customModel: form.custom,
      effort: levels && form.effort ? (form.effort as EffortLevel) : undefined,
      temperature: info?.capabilities.samplingParams ? optionalNumber(form.temperature) : undefined,
      maxTokens: optionalNumber(form.maxTokens),
    })
    if (!result.success) {
      toast.showError(result.error || `Failed to update the ${purpose} LLM provider`)
      return
    }
    toast.showSuccess(`${purpose === "chat" ? "Admin assistant" : "Rewind"} model saved`)
    router.refresh()
    return { ...form, apiKey: "" }
  })
  const form = settings.values

  const info = form.model ? lookupModel(form.provider, form.model) : null
  const effortLevels = info?.capabilities.effortLevels ?? null
  const takesTemperature = info?.capabilities.samplingParams ?? false
  // The stored key is reused only for the same provider and base-URL origin (the action's rule)
  const keyReusable =
    Boolean(stored?.hasApiKey) &&
    stored?.provider === form.provider &&
    (form.provider !== "openai-compatible" || originOf(form.baseUrl) === originOf(stored?.baseUrl ?? ""))

  const storedProvider = stored?.provider ?? null
  const storedBaseUrl = stored?.baseUrl ?? null
  // The stored provider's model list, when the section mounts
  useEffect(() => {
    if (!storedProvider || !isLLMProviderId(storedProvider)) return
    let cancelled = false
    const request = { purpose, provider: storedProvider, apiKey: undefined, baseUrl: storedProvider === "openai-compatible" ? (storedBaseUrl ?? "") : undefined }
    listLLMModels(request).then((result) => {
      if (!cancelled) setLiveModels(result.success ? result.models : null)
    })
    return () => {
      cancelled = true
    }
  }, [purpose, storedProvider, storedBaseUrl])

  const changeProvider = (value: string) => {
    if (!isLLMProviderId(value)) return
    setLiveModels(null)
    settings.set({
      provider: value,
      model: "",
      custom: false,
      effort: "",
      temperature: "",
      baseUrl: value === stored?.provider ? (stored?.baseUrl ?? "") : "",
    })
  }

  const changeBaseUrl = (baseUrl: string) => {
    setLiveModels(null)
    settings.set({ baseUrl })
  }

  /** Loads the provider's model list with the typed values, and says whether the model is in it. */
  const testConnection = async (): Promise<TestResult> => {
    setIsLoading(true)
    try {
      const result = await listLLMModels(listRequest(purpose, form))
      setLiveModels(result.success ? result.models : null)
      if (!result.success) return { ok: false, message: result.error }
      const listed = !form.model || form.custom || result.models.includes(form.model)
      return listed
        ? { ok: true, message: `Connected: ${result.models.length} models available` }
        : { ok: false, message: `Connected, but the provider does not list ${form.model}` }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    form,
    update: settings.set,
    settingsForm: settings.form,
    liveModels,
    busy: settings.form.isPending || isLoading,
    effortLevels,
    takesTemperature,
    keyReusable,
    keyOptional: form.provider === "openai-compatible" || keyReusable,
    changeProvider,
    changeBaseUrl,
    testConnection,
  }
}

export type LLMProviderFormState = ReturnType<typeof useLLMProviderForm>
