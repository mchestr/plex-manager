import { useState } from "react"

import { listLLMModels, updateChatLLMProvider, updateWrappedLLMProvider } from "@/actions/admin/admin-llm-providers"
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

/** A typed number, or undefined when blank or not a number. */
const optionalNumber = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined)

/** What both actions take from the form: a blank key keeps the stored one where the action allows it. */
const connection = (state: LLMFormState) => ({
  provider: state.provider,
  apiKey: state.apiKey.trim() || undefined,
  baseUrl: state.provider === "openai-compatible" ? state.baseUrl : undefined,
})

/**
 * State and actions of one purpose's LLM provider form, which the AI section
 * shows after Edit: the fields and their dirty state, which settings the
 * chosen model takes, whether the stored key can be reused, the provider's
 * model list, Test and Save. The section holds one per purpose above its
 * view and edit modes, so a Test from the summary feeds the picker after Edit.
 *
 * The picker starts from the static catalogue in `lib/llm/models.ts`, so
 * opening the page asks the provider for nothing (P10.7); Test connection
 * loads the provider's own list and adds the models the catalogue lacks.
 * Discard (Cancel) also clears the field errors, and the list when the
 * fields had changed, since it may be another provider's.
 */
export function useLLMProviderForm(stored: StoredLLMProvider | null, purpose: "chat" | "wrapped") {
  const toast = useToast()
  const [liveModels, setLiveModels] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<"apiKey" | "baseUrl" | "model", string>>>({})

  const settings = useSettingsForm(initialState(stored), async (form) => {
    if (!form.model.trim()) {
      setErrors({ model: "Choose a model" })
      return { ok: false }
    }
    const info = lookupModel(form.provider, form.model)
    const levels = info?.capabilities.effortLevels ?? null
    const action = purpose === "chat" ? updateChatLLMProvider : updateWrappedLLMProvider
    const result = await action({
      ...connection(form),
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
      return { ok: false }
    }
    // The action revalidates the page, so the stored provider follows
    setErrors({})
    toast.showSuccess(`${purpose === "chat" ? "Admin assistant" : "Rewind"} model saved`)
    return { ok: true, keep: { ...form, apiKey: "" } }
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

  /** Puts the saved values back and clears the errors, and the model list when it may be another provider's. */
  const onDiscard = () => {
    if (settings.form.isDirty) setLiveModels(null)
    settings.form.onDiscard()
    setErrors({})
  }

  /** Loads the provider's model list with the form's values, and says whether the model is in it. */
  const testConnection = async (): Promise<TestResult> => {
    // Nothing saved and nothing typed: the provider would only be asked for a key
    if (!stored && !settings.form.isDirty) return { ok: false, message: "Nothing to test yet", detail: "Set up this model first, then test it." }
    setIsLoading(true)
    try {
      const result = await listLLMModels({ purpose, ...connection(form) })
      setLiveModels(result.success ? result.data.models : null)
      if (!result.success) return { ok: false, message: result.error }
      const listed = !form.model || form.custom || result.data.models.includes(form.model)
      return listed
        ? { ok: true, message: `Connected: ${result.data.models.length} models available` }
        : { ok: false, message: `Connected, but the provider does not list ${form.model}` }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    form,
    update,
    errors,
    settingsForm: { ...settings.form, onDiscard, blockedReason: blocked ? "Enter the API key to test or save" : undefined },
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
