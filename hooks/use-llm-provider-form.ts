import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { listLLMModels, updateChatLLMProvider, updateWrappedLLMProvider } from "@/actions/admin"
import { useToast } from "@/components/ui/toast"
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

/**
 * State and actions of the LLM provider form: the fields, which settings the
 * chosen model takes, whether the stored key can be reused, the provider's
 * model list, Test and Save.
 */
export function useLLMProviderForm(stored: StoredLLMProvider | null, purpose: "chat" | "wrapped") {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [isTesting, startTesting] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<LLMFormState>(() => initialState(stored))
  const [liveModels, setLiveModels] = useState<string[] | null>(null)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)

  const info = form.model ? lookupModel(form.provider, form.model) : null
  const effortLevels = info?.capabilities.effortLevels ?? null
  const takesTemperature = info?.capabilities.samplingParams ?? false
  // The stored key is reused only for the same provider and base-URL origin (the action's rule)
  const keyReusable =
    Boolean(stored?.hasApiKey) &&
    stored?.provider === form.provider &&
    (form.provider !== "openai-compatible" || originOf(form.baseUrl) === originOf(stored?.baseUrl ?? ""))

  const update = (patch: Partial<LLMFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setTest(null)
  }

  const loadModels = (state: LLMFormState, announce: boolean) => {
    startTesting(async () => {
      const result = await listLLMModels({
        purpose,
        provider: state.provider,
        apiKey: state.apiKey.trim() || undefined,
        baseUrl: state.provider === "openai-compatible" ? state.baseUrl : undefined,
      })
      if (!result.success) {
        setLiveModels(null)
        if (announce) setTest({ ok: false, message: result.error })
        return
      }
      setLiveModels(result.models)
      if (!announce) return
      const listed = !state.model || state.custom || result.models.includes(state.model)
      setTest(
        listed
          ? { ok: true, message: `Connected: ${result.models.length} models available` }
          : { ok: false, message: `Connected, but the provider does not list ${state.model}` }
      )
    })
  }

  const startEditing = () => {
    const state = initialState(stored)
    setForm(state)
    setTest(null)
    setLiveModels(null)
    setIsEditing(true)
    if (stored) loadModels(state, false)
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

  const save = () => {
    if (!form.model.trim()) {
      toast.showError("Model is required")
      return
    }
    startSaving(async () => {
      const action = purpose === "chat" ? updateChatLLMProvider : updateWrappedLLMProvider
      const result = await action({
        provider: form.provider,
        // A blank key keeps the stored one when the action allows it
        apiKey: form.apiKey.trim() || undefined,
        baseUrl: form.provider === "openai-compatible" ? form.baseUrl : undefined,
        model: form.model.trim(),
        customModel: form.custom,
        effort: effortLevels && form.effort ? (form.effort as EffortLevel) : undefined,
        temperature: takesTemperature ? optionalNumber(form.temperature) : undefined,
        maxTokens: optionalNumber(form.maxTokens),
      })
      if (result.success) {
        setIsEditing(false)
        toast.showSuccess(`${purpose === "chat" ? "Chat" : "Rewind"} LLM provider updated`)
        router.refresh()
      } else {
        toast.showError(result.error || `Failed to update the ${purpose} LLM provider`)
      }
    })
  }

  return {
    form,
    update,
    liveModels,
    test,
    isEditing,
    isSaving,
    busy: isSaving || isTesting,
    isTesting,
    effortLevels,
    takesTemperature,
    keyReusable,
    keyOptional: form.provider === "openai-compatible" || keyReusable,
    startEditing,
    cancel: () => setIsEditing(false),
    changeProvider,
    changeBaseUrl,
    testConnection: () => loadModels(form, true),
    save,
  }
}
