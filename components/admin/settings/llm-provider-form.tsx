"use client"

import { LLMBaseUrlField } from "@/components/admin/settings/llm-base-url-field"
import { LLMModelPicker } from "@/components/admin/settings/llm-model-picker"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import type { LLMProviderFormState } from "@/hooks/use-llm-provider-form"
import { LLM_PROVIDER_IDS, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

interface LLMProviderFieldsProps {
  purpose: "chat" | "wrapped"
  /** `useLLMProviderForm(stored, purpose)`, held by the AI section. */
  state: LLMProviderFormState
}

/**
 * The LLM provider fields for one purpose, always open (UI-31), as FormFields
 * (UI-13): provider, base URL (OpenAI-compatible only), the key as a
 * `SecretInput` that asks for re-entry when the provider or its address
 * changes (SEC-31), model with its price, and only the settings the model
 * supports. The AI section's footer tests and saves them.
 */
export function LLMProviderFields({ purpose, state }: LLMProviderFieldsProps) {
  const { form, update, busy, effortLevels, errors } = state
  const idPrefix = `llm-${purpose}`

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid={`llm-provider-form-${purpose}`}>
      <FormField name={`${idPrefix}-provider`} label="Provider">
        <StyledDropdown
          value={form.provider}
          onChange={state.changeProvider}
          options={LLM_PROVIDER_IDS.map((id) => ({ value: id, label: LLM_PROVIDER_LABELS[id] }))}
          size="md"
          disabled={busy}
          data-testid="llm-provider-select"
        />
      </FormField>
      <FormField name={`${idPrefix}-model`} label="Model" error={errors.model}>
        <LLMModelPicker
          provider={form.provider}
          model={form.model}
          custom={form.custom}
          liveModels={state.liveModels}
          onChange={(model, custom) => update({ model, custom, effort: "", temperature: "" })}
          disabled={busy}
        />
      </FormField>
      {form.provider === "openai-compatible" && (
        <FormField
          name={`${idPrefix}-base-url`}
          label="Base URL"
          description="The server's OpenAI-compatible API, including its path (usually /v1)."
          error={errors.baseUrl}
          className="md:col-span-2"
        >
          <LLMBaseUrlField value={form.baseUrl} onChange={state.changeBaseUrl} disabled={busy} />
        </FormField>
      )}
      <FormField
        name={`${idPrefix}-api-key`}
        label="API key"
        optional={form.provider === "openai-compatible"}
        description={form.provider === "openai-compatible" && !state.savedKey ? "Optional for a local server." : undefined}
        error={errors.apiKey}
        className="md:col-span-2"
      >
        <SecretInput
          value={form.apiKey}
          onValueChange={(apiKey) => update({ apiKey })}
          saved={state.savedKey}
          currentOrigin={state.currentOrigin}
          placeholder="Enter the API key"
          required={!state.keyOptional}
          disabled={busy}
          data-testid="llm-api-key-input"
        />
      </FormField>
      {effortLevels && (
        <FormField name={`${idPrefix}-effort`} label="Effort">
          <StyledDropdown
            value={form.effort}
            onChange={(effort) => update({ effort })}
            options={[{ value: "", label: "Model default" }, ...effortLevels.map((level) => ({ value: level, label: level }))]}
            size="md"
            disabled={busy}
            data-testid="llm-effort-select"
          />
        </FormField>
      )}
      {state.takesTemperature && (
        <FormField name={`${idPrefix}-temperature`} label="Temperature" optional description="From 0.0 to 2.0.">
          <Input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={form.temperature}
            onValueChange={(temperature) => update({ temperature })}
            placeholder="Model default"
            disabled={busy}
            data-testid="llm-temperature-input"
          />
        </FormField>
      )}
      <FormField name={`${idPrefix}-max-tokens`} label="Max tokens" optional description="From 1 to 100,000.">
        <Input
          type="number"
          min="1"
          max="100000"
          step="1"
          value={form.maxTokens}
          onValueChange={(maxTokens) => update({ maxTokens })}
          placeholder="Default"
          disabled={busy}
          data-testid="llm-max-tokens-input"
        />
      </FormField>
    </div>
  )
}
