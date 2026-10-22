import { useState } from "react"

import { listLLMModels, updateChatLLMProvider, updateWrappedLLMProvider } from "@/actions/admin"
import type { TestResult } from "@/components/ui/settings-section"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { listKnownModels, lookupModel, type EffortLevel, type LLMProviderId } from "@/lib/llm/models"
import { isLLMProviderId, llmKeyDestination } from "@/lib/llm/provider-presets"
import { needsSecretReentry, safeOrigin, type SavedSecret } from "@/lib/security/saved-secret"

/** The active provider row as the settings page sends it, without the key. */
export interface StoredLLMProvider {
  provider: string
  model: string | null
  /** The stored key's last four and the origin it is sent to (never the key itself). */
  secret: SavedSecret | null
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
 *
 * The picker starts from the static catalogue in `lib/llm/models.ts`, so
 * opening the page asks the provider for nothing (P10.7); Test connection
 * loads the provider's own list and adds the models the catalogue lacks.
 */
export function useLLMProviderForm(stored: StoredLLMProvider | null, purpose: "chat" | "wrapped") {
  const toast = useToast()
  const [liveModels, setLiveModels] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<"apiKey" | "baseUrl" | "model", string>>>({})

  const settings = useSettingsForm(initialState(stored), async (form) => {
    if (!form.model.trim()) {
      setErrors({ model: "Choose a model" })
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
      const field = (["apiKey", "baseUrl", "model"] as const).find((key) => result.fieldErrors?.[key]?.[0])
      // A field error shows on its field; anything else is a toast
      if (field) setErrors({ [field]: result.fieldErrors?.[field]?.[0] })
      else toast.showError(result.error)
      return
    }
    // The action revalidates the page, so the stored provider follows
    setErrors({})
    toast.showSuccess(`${purpose === "chat" ? "Admin assistant" : "Rewind"} model saved`)
    return { ...form, apiKey: "" }
  })
  const form = settings.values

  const info = form.model ? lookupModel(form.provider, form.model) : null
  const effortLevels = info?.capabilities.effortLevels ?? null
  const takesTemperature = info?.capabilities.samplingParams ?? false
  // The stored key is reused only for the same provider and the same origin of
  // the address it is sent to (the action's rule, SEC-31)
  const currentOrigin = safeOrigin(llmKeyDestination(form.provider, form.baseUrl))
  const sameProvider = stored?.provider === form.provider
  const keyReusable = sameProvider && Boolean(stored?.secret) && !needsSecretReentry(stored?.secret, currentOrigin, "")
  const keyOptional = form.provider === "openai-compatible" || keyReusable
  // The saved key as SecretInput shows it: "Saved", or "re-enter" for a new
  // address. A local server needs no key, so there it simply reads as unset.
  const savedKey = !keyReusable && form.provider === "openai-compatible" ? null : (stored?.secret ?? null)
  const blocked = !keyOptional && Boolean(savedKey) && !form.apiKey.trim()

  /** Changes fields and clears their errors. */
  const update = (patch: Partial<LLMFormState>) => {
    settings.set(patch)
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  const changeProvider = (value: string) => {
    if (!isLLMProviderId(value)) return
    setLiveModels(null)
    update({
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
    update({ baseUrl })
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
    update,
    errors,
    settingsForm: { ...settings.form, blockedReason: blocked ? "Enter the API key to test or save" : undefined },
    liveModels,
    busy: settings.form.isPending || isLoading,
    effortLevels,
    takesTemperature,
    savedKey,
    currentOrigin,
    keyOptional,
    changeProvider,
    changeBaseUrl,
    testConnection,
  }
}

export type LLMProviderFormState = ReturnType<typeof useLLMProviderForm>
