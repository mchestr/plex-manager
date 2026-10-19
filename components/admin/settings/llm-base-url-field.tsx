"use client"

import { Button } from "@/components/ui/button"
import { StyledInput } from "@/components/ui/styled-input"
import { OPENAI_COMPATIBLE_PRESETS } from "@/lib/llm/provider-presets"

interface LLMBaseUrlFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** The base URL of an OpenAI-compatible server, with one-click presets. The form renders its label. */
export function LLMBaseUrlField({ id, value, onChange, disabled }: LLMBaseUrlFieldProps) {
  return (
    <div>
      <StyledInput
        id={id}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={OPENAI_COMPATIBLE_PRESETS.ollama.baseUrl}
        required
        disabled={disabled}
        autoComplete="off"
        data-testid="llm-base-url-input"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(OPENAI_COMPATIBLE_PRESETS).map(([key, preset]) => (
          <Button
            key={key}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange(preset.baseUrl)}
            disabled={disabled}
            data-testid={`llm-base-url-preset-${key}`}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <p className="mt-1 text-xs opacity-70">
        The server&apos;s OpenAI-compatible API, including its path (usually /v1).
      </p>
    </div>
  )
}
