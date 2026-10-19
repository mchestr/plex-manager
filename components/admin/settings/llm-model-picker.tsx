"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { StyledInput } from "@/components/ui/styled-input"
import { listKnownModels, lookupModel, priceAt, type LLMProviderId, type ModelInfo } from "@/lib/llm/models"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"

const CUSTOM = "__custom__"
const RETIREMENT_WINDOW_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

function formatUsd(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(3).replace(/0$/, "")}`
}

/** "$2 / $10 per 1M tokens, as of Oct 17, 2026", or a note when the price is unknown. */
function priceLabel(info: ModelInfo, at: Date, f: BoundFormat): string {
  const price = priceAt(info, at)
  if (!price) return "Price unknown: usage of this model is recorded at $0"
  return `${formatUsd(price.input)} / ${formatUsd(price.output)} per 1M tokens, as of ${f.dayKey(price.asOf)}`
}

/** "Retires on Oct 23, 2026" within 60 days of retirement (or after it), else null. */
function retirementLabel(info: ModelInfo, now: Date, f: BoundFormat): string | null {
  if (!info.retiresOn) return null
  const days = (Date.parse(`${info.retiresOn}T00:00:00Z`) - now.getTime()) / DAY_MS
  if (days > RETIREMENT_WINDOW_DAYS) return null
  return `${days < 0 ? "Retired on" : "Retires on"} ${f.dayKey(info.retiresOn)}`
}

/**
 * The picker's model ids: catalogue models first (those the provider listed,
 * when a list has loaded), then the rest of the provider's list.
 */
function orderModels(provider: LLMProviderId, live: string[] | null): string[] {
  const known = listKnownModels(provider).map((info) => info.id)
  if (!live) return known
  const liveSet = new Set(live)
  const knownListed = known.filter((id) => liveSet.has(id))
  const knownSet = new Set(knownListed)
  return [...knownListed, ...live.filter((id) => !knownSet.has(id))]
}

interface LLMModelPickerProps {
  id: string
  provider: LLMProviderId
  model: string
  custom: boolean
  /** The provider's own list, once loaded. */
  liveModels: string[] | null
  onChange: (model: string, custom: boolean) => void
  disabled?: boolean
}

/**
 * Model select with known models first, a custom id, and each model's price
 * and retirement. The form renders its label (`id` is the select's).
 */
export function LLMModelPicker({ id, provider, model, custom, liveModels, onChange, disabled }: LLMModelPickerProps) {
  const f = useFormat()
  const [now] = useState(() => new Date())
  const listed = orderModels(provider, liveModels)
  // A saved model the provider no longer lists stays selectable
  const ids = !custom && model && !listed.includes(model) ? [model, ...listed] : listed
  const info = model ? lookupModel(provider, model) : null
  const retirement = info ? retirementLabel(info, now, f) : null

  return (
    <div>
      <StyledDropdown
        id={id}
        value={custom ? CUSTOM : model}
        onChange={(value) => (value === CUSTOM ? onChange("", true) : onChange(value, false))}
        options={[
          ...ids.map((modelId) => ({
            value: modelId,
            label: lookupModel(provider, modelId).displayName,
          })),
          { value: CUSTOM, label: "Enter a custom model id…" },
        ]}
        placeholder="Select a model"
        size="md"
        disabled={disabled}
        data-testid="llm-model-select"
      />
      {custom && (
        <StyledInput
          className="mt-2"
          type="text"
          aria-label="Custom model id"
          value={model}
          onChange={(e) => onChange(e.target.value, true)}
          placeholder={provider === "openai" ? `e.g. ${DEFAULT_OPENAI_MODEL}` : "Model id"}
          required
          disabled={disabled}
          autoComplete="off"
          data-testid="llm-model-custom-input"
        />
      )}
      {info && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs opacity-70" data-testid="llm-model-price">
            {priceLabel(info, now, f)}
          </p>
          {retirement && (
            <Badge tone="warning" data-testid="llm-model-retires">
              {retirement}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
