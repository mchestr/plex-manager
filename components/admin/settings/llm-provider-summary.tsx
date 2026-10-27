"use client"

import { useState } from "react"

import { priceLabel, retirementLabel } from "@/components/admin/settings/llm-model-picker"
import { Badge } from "@/components/ui/badge"
import { NotSet, SecretSummary, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { StoredLLMProvider } from "@/hooks/use-llm-provider-form"
import { useFormat } from "@/lib/format-context"
import { listKnownModels, lookupModel, type ModelInfo } from "@/lib/llm/models"
import { isLLMProviderId, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

interface LLMProviderSummaryProps {
  purpose: "chat" | "wrapped"
  /** The saved provider; null says "Not set up." (the form would default to OpenAI). */
  stored: StoredLLMProvider | null
  /** Opens the form on the API key, offered when the stored key can't be read. */
  onReenter: () => void
}

interface ModelValueProps {
  /** The saved model id. */
  id: string
  info: ModelInfo
  /** Not in the catalogue, as the form reads it: shown as saved. */
  custom: boolean
  testId: string
}

/** The model's name ("GPT-4o", or a custom id as saved), its price and, near retirement, a warning. */
function ModelValue({ id, info, custom, testId }: ModelValueProps) {
  const f = useFormat()
  const [now] = useState(() => new Date())
  const retirement = retirementLabel(info, now, f)
  return (
    <span className="flex flex-col gap-1">
      {custom ? (
        <span>
          <span className="font-mono break-all">{id}</span> <span className="text-muted-foreground">(custom)</span>
        </span>
      ) : (
        <span>{info.displayName}</span>
      )}
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-label text-muted-foreground" data-testid={`${testId}-price`}>
          {priceLabel(info, now, f)}
        </span>
        {retirement && (
          <Badge variant="warning" data-testid={`${testId}-retires`}>
            {retirement}
          </Badge>
        )}
      </span>
    </span>
  )
}

/**
 * One purpose's saved provider in the AI section's view mode, in the form's
 * order and grid: provider, model with its price, base URL (OpenAI-compatible
 * only), the key (never its value, SEC-31), and effort and temperature only
 * where the model takes them, as the form and its save do.
 */
export function LLMProviderSummary({ purpose, stored, onReenter }: LLMProviderSummaryProps) {
  const f = useFormat()
  const row = (key: string) => `settings-ai-summary-${purpose}-${key}`

  if (!stored) {
    return (
      <p className="text-ui text-muted-foreground" data-testid={row("empty")}>
        Not set up.
      </p>
    )
  }

  const provider = isLLMProviderId(stored.provider) ? stored.provider : null
  const model = stored.model
  const info = provider && model ? lookupModel(provider, model) : null
  const local = provider === "openai-compatible"

  return (
    <SettingsSummary data-testid={`settings-ai-summary-${purpose}`}>
      <SettingsSummaryRow label="Provider" data-testid={row("provider")}>
        {provider ? LLM_PROVIDER_LABELS[provider] : stored.provider}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Model" data-testid={row("model")}>
        {provider && model && info ? (
          <ModelValue id={model} info={info} custom={!listKnownModels(provider).some((known) => known.id === model)} testId={row("model")} />
        ) : model ? (
          // A provider this version does not know: the id as saved
          <span className="font-mono break-all">{model}</span>
        ) : (
          <NotSet />
        )}
      </SettingsSummaryRow>
      {local && (
        <SettingsSummaryRow label="Base URL" wide mono={Boolean(stored.baseUrl)} data-testid={row("base-url")}>
          {stored.baseUrl || <NotSet />}
        </SettingsSummaryRow>
      )}
      <SettingsSummaryRow label="API key" wide data-testid={row("api-key")}>
        <SecretSummary
          saved={stored.secret}
          noun="API key"
          empty={local ? "None (local server)" : undefined}
          onReenter={onReenter}
          reenterTestId={row("api-key-reenter")}
        />
      </SettingsSummaryRow>
      {info?.capabilities.effortLevels && (
        <SettingsSummaryRow label="Effort" data-testid={row("effort")}>
          {stored.effort || <NotSet>Model default</NotSet>}
        </SettingsSummaryRow>
      )}
      {info?.capabilities.samplingParams && (
        <SettingsSummaryRow label="Temperature" data-testid={row("temperature")}>
          {stored.temperature === null ? <NotSet>Model default</NotSet> : f.number(stored.temperature)}
        </SettingsSummaryRow>
      )}
      <SettingsSummaryRow label="Max tokens" data-testid={row("max-tokens")}>
        {stored.maxTokens === null ? <NotSet>Default</NotSet> : f.number(stored.maxTokens)}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}
