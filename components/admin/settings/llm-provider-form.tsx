"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { listLLMModels, updateChatLLMProvider, updateWrappedLLMProvider } from "@/actions/admin"
import { LLMBaseUrlField } from "@/components/admin/settings/llm-base-url-field"
import { LLMModelPicker } from "@/components/admin/settings/llm-model-picker"
import { Button } from "@/components/ui/button"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { StyledInput } from "@/components/ui/styled-input"
import { useToast } from "@/components/ui/toast"
import { listKnownModels, lookupModel, type EffortLevel, type LLMProviderId } from "@/lib/llm/models"
import { isLLMProviderId, LLM_PROVIDER_IDS, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

interface StoredProvider {
  provider: string
  model: string | null
  /** A key is stored (never the value itself). */
  hasApiKey: boolean
  baseUrl: string | null
  effort: string | null
  temperature: number | null
  maxTokens: number | null
}

interface LLMProviderFormProps {
  /** The active provider config, with the API key stripped. */
  provider: StoredProvider | null
  purpose: "chat" | "wrapped"
}

interface FormState {
  provider: LLMProviderId
  apiKey: string
  baseUrl: string
  model: string
  custom: boolean
  effort: string
  temperature: string
  maxTokens: string
}

type TestState = { ok: boolean; message: string } | null

function initialState(stored: StoredProvider | null): FormState {
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

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-400 mb-1">
      {children}
      {required && <span className="text-red-400"> *</span>}
    </label>
  )
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-400 mb-1">{label}</div>
      <div className="text-sm text-white">{children}</div>
    </div>
  )
}

/**
 * The LLM provider for one purpose: provider, base URL (OpenAI-compatible
 * only), key, model with its price, and the settings the model supports.
 */
export function LLMProviderForm({ provider: stored, purpose }: LLMProviderFormProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isTesting, startTesting] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => initialState(stored))
  const [liveModels, setLiveModels] = useState<string[] | null>(null)
  const [test, setTest] = useState<TestState>(null)

  const info = form.model ? lookupModel(form.provider, form.model) : null
  const effortLevels = info?.capabilities.effortLevels ?? null
  const takesTemperature = info?.capabilities.samplingParams ?? false
  // The stored key is reused only for the same provider and base-URL origin
  const keyReusable =
    Boolean(stored?.hasApiKey) &&
    stored?.provider === form.provider &&
    (form.provider !== "openai-compatible" || originOf(form.baseUrl) === originOf(stored?.baseUrl ?? ""))
  const keyOptional = form.provider === "openai-compatible" || keyReusable

  const update = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setTest(null)
  }

  const loadModels = (state: FormState, announce: boolean) => {
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
          ? {
              ok: true,
              message: `Connected: ${result.models.length} models available`,
            }
          : {
              ok: false,
              message: `Connected, but the provider does not list ${state.model}`,
            },
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

  const handleProviderChange = (value: string) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.model.trim()) {
      toast.showError("Model is required")
      return
    }

    startTransition(async () => {
      const save = purpose === "chat" ? updateChatLLMProvider : updateWrappedLLMProvider
      const result = await save({
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

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {stored ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <ReadOnlyField label="Provider">
                <span className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs font-medium">
                  {isLLMProviderId(stored.provider) ? LLM_PROVIDER_LABELS[stored.provider] : stored.provider}
                </span>
              </ReadOnlyField>
              <ReadOnlyField label="Model">
                <span className="font-mono">{stored.model || "Not configured"}</span>
              </ReadOnlyField>
              <ReadOnlyField label={stored.effort ? "Effort" : "Temperature"}>
                {stored.effort ?? stored.temperature ?? "Model default"}
              </ReadOnlyField>
              <ReadOnlyField label="Max Tokens">{stored.maxTokens ?? "Default"}</ReadOnlyField>
              {stored.baseUrl && (
                <div className="md:col-span-4">
                  <ReadOnlyField label="Base URL">
                    <span className="font-mono break-all">{stored.baseUrl}</span>
                  </ReadOnlyField>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400">No LLM provider configured</div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={startEditing}
          className="ml-4"
          data-testid={`llm-edit-${purpose}`}
        >
          Edit
        </Button>
      </div>
    )
  }

  const idPrefix = `llm-${purpose}`
  const busy = isPending || isTesting

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid={`llm-provider-form-${purpose}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor={`${idPrefix}-provider`}>Provider</FieldLabel>
          <StyledDropdown
            id={`${idPrefix}-provider`}
            value={form.provider}
            onChange={handleProviderChange}
            options={LLM_PROVIDER_IDS.map((id) => ({
              value: id,
              label: LLM_PROVIDER_LABELS[id],
            }))}
            size="md"
            disabled={busy}
            data-testid="llm-provider-select"
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}-model`} required>
            Model
          </FieldLabel>
          <LLMModelPicker
            id={`${idPrefix}-model`}
            provider={form.provider}
            model={form.model}
            custom={form.custom}
            liveModels={liveModels}
            onChange={(model, custom) => update({ model, custom, effort: "", temperature: "" })}
            disabled={busy}
          />
        </div>
        {form.provider === "openai-compatible" && (
          <div className="md:col-span-2">
            <FieldLabel htmlFor={`${idPrefix}-base-url`} required>
              Base URL
            </FieldLabel>
            <LLMBaseUrlField
              id={`${idPrefix}-base-url`}
              value={form.baseUrl}
              onChange={(baseUrl) => {
                setLiveModels(null)
                update({ baseUrl })
              }}
              disabled={busy}
            />
          </div>
        )}
        <div className="md:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-api-key`} required={!keyOptional}>
            API Key
          </FieldLabel>
          <StyledInput
            id={`${idPrefix}-api-key`}
            type="password"
            value={form.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder={
              keyReusable
                ? "Leave blank to keep the current key"
                : form.provider === "openai-compatible"
                  ? "Optional for a local server"
                  : "Enter the API key"
            }
            required={!keyOptional}
            disabled={busy}
            autoComplete="off"
            data-testid="llm-api-key-input"
          />
        </div>
        {effortLevels && (
          <div>
            <FieldLabel htmlFor={`${idPrefix}-effort`}>Effort</FieldLabel>
            <StyledDropdown
              id={`${idPrefix}-effort`}
              value={form.effort}
              onChange={(effort) => update({ effort })}
              options={[
                { value: "", label: "Model default" },
                ...effortLevels.map((level) => ({
                  value: level,
                  label: level,
                })),
              ]}
              size="md"
              disabled={busy}
              data-testid="llm-effort-select"
            />
          </div>
        )}
        {takesTemperature && (
          <div>
            <FieldLabel htmlFor={`${idPrefix}-temperature`}>Temperature (0.0-2.0, optional)</FieldLabel>
            <StyledInput
              id={`${idPrefix}-temperature`}
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={form.temperature}
              onChange={(e) => update({ temperature: e.target.value })}
              placeholder="Model default"
              disabled={busy}
              data-testid="llm-temperature-input"
            />
          </div>
        )}
        <div>
          <FieldLabel htmlFor={`${idPrefix}-max-tokens`}>Max Tokens (1-100000, optional)</FieldLabel>
          <StyledInput
            id={`${idPrefix}-max-tokens`}
            type="number"
            min="1"
            max="100000"
            step="1"
            value={form.maxTokens}
            onChange={(e) => update({ maxTokens: e.target.value })}
            placeholder="Default"
            disabled={busy}
            data-testid="llm-max-tokens-input"
          />
        </div>
      </div>
      {test && (
        <p
          role="status"
          className={test.ok ? "text-xs text-green-400" : "text-xs text-amber-400"}
          data-testid="llm-test-result"
        >
          {test.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy} data-testid="llm-save">
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => loadModels(form, true)}
          disabled={busy}
          data-testid="llm-test-connection"
        >
          {isTesting ? "Testing..." : "Test"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setIsEditing(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
