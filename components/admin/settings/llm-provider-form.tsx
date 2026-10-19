"use client"

import { LLMBaseUrlField } from "@/components/admin/settings/llm-base-url-field"
import { LLMModelPicker } from "@/components/admin/settings/llm-model-picker"
import { Button } from "@/components/ui/button"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { StyledInput } from "@/components/ui/styled-input"
import { useLLMProviderForm, type StoredLLMProvider } from "@/hooks/use-llm-provider-form"
import { isLLMProviderId, LLM_PROVIDER_IDS, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

interface LLMProviderFormProps {
  /** The active provider config, with the API key stripped. */
  provider: StoredLLMProvider | null
  purpose: "chat" | "wrapped"
}

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
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

function ProviderSummary({ stored }: { stored: StoredLLMProvider }) {
  return (
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
  )
}

/**
 * The LLM provider for one purpose: provider, base URL (OpenAI-compatible
 * only), key, model with its price, and only the settings the model supports.
 */
export function LLMProviderForm({ provider: stored, purpose }: LLMProviderFormProps) {
  const state = useLLMProviderForm(stored, purpose)
  const { form, update, busy, effortLevels } = state

  if (!state.isEditing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {stored ? (
            <ProviderSummary stored={stored} />
          ) : (
            <div className="text-sm text-slate-400">No LLM provider configured</div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={state.startEditing}
          className="ml-4"
          data-testid={`llm-edit-${purpose}`}
        >
          Edit
        </Button>
      </div>
    )
  }

  const idPrefix = `llm-${purpose}`

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        state.save()
      }}
      className="space-y-4"
      data-testid={`llm-provider-form-${purpose}`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor={`${idPrefix}-provider`}>Provider</FieldLabel>
          <StyledDropdown
            id={`${idPrefix}-provider`}
            value={form.provider}
            onChange={state.changeProvider}
            options={LLM_PROVIDER_IDS.map((id) => ({ value: id, label: LLM_PROVIDER_LABELS[id] }))}
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
            liveModels={state.liveModels}
            onChange={(model, custom) => update({ model, custom, effort: "", temperature: "" })}
            disabled={busy}
          />
        </div>
        {form.provider === "openai-compatible" && (
          <div className="md:col-span-2">
            <FieldLabel htmlFor={`${idPrefix}-base-url`} required>
              Base URL
            </FieldLabel>
            <LLMBaseUrlField id={`${idPrefix}-base-url`} value={form.baseUrl} onChange={state.changeBaseUrl} disabled={busy} />
          </div>
        )}
        <div className="md:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-api-key`} required={!state.keyOptional}>
            API Key
          </FieldLabel>
          <StyledInput
            id={`${idPrefix}-api-key`}
            type="password"
            value={form.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder={
              state.keyReusable
                ? "Leave blank to keep the current key"
                : form.provider === "openai-compatible"
                  ? "Optional for a local server"
                  : "Enter the API key"
            }
            required={!state.keyOptional}
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
              options={[{ value: "", label: "Model default" }, ...effortLevels.map((level) => ({ value: level, label: level }))]}
              size="md"
              disabled={busy}
              data-testid="llm-effort-select"
            />
          </div>
        )}
        {state.takesTemperature && (
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
      {state.test && (
        <p
          role="status"
          className={state.test.ok ? "text-xs text-green-400" : "text-xs text-amber-400"}
          data-testid="llm-test-result"
        >
          {state.test.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy} data-testid="llm-save">
          {state.isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={state.testConnection}
          disabled={busy}
          data-testid="llm-test-connection"
        >
          {state.isTesting ? "Testing..." : "Test"}
        </Button>
        <Button type="button" variant="secondary" onClick={state.cancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
