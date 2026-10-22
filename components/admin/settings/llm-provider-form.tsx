"use client"

import { LLMBaseUrlField } from "@/components/admin/settings/llm-base-url-field"
import { LLMModelPicker } from "@/components/admin/settings/llm-model-picker"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { StyledInput } from "@/components/ui/styled-input"
import type { LLMProviderFormState } from "@/hooks/use-llm-provider-form"
import { LLM_PROVIDER_IDS, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

interface LLMProviderFieldsProps {
  purpose: "chat" | "wrapped"
  /** `useLLMProviderForm(stored, purpose)`, held by the AI section. */
  state: LLMProviderFormState
}

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground mb-1">
      {children}
      {required && <span className="text-destructive"> *</span>}
    </label>
  )
}

/**
 * The LLM provider fields for one purpose, always open (UI-31): provider,
 * base URL (OpenAI-compatible only), key, model with its price, and only the
 * settings the model supports. The AI section's footer tests and saves them.
 */
export function LLMProviderFields({ purpose, state }: LLMProviderFieldsProps) {
  const { form, update, busy, effortLevels } = state
  const idPrefix = `llm-${purpose}`

  return (
    <div className="space-y-4" data-testid={`llm-provider-form-${purpose}`}>
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
    </div>
  )
}
