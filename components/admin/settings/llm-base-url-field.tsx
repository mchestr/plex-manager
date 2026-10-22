"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OPENAI_COMPATIBLE_PRESETS } from "@/lib/llm/provider-presets"

interface LLMBaseUrlFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * The base URL of an OpenAI-compatible server, with one-click presets. It
 * sits in a `FormField`, which labels it and shows its description.
 */
export function LLMBaseUrlField({ value, onChange, disabled }: LLMBaseUrlFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="url"
        value={value}
        onValueChange={onChange}
        placeholder={OPENAI_COMPATIBLE_PRESETS.ollama.baseUrl}
        required
        disabled={disabled}
        autoComplete="off"
        data-testid="llm-base-url-input"
      />
      <div className="flex flex-wrap gap-2">
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
    </div>
  )
}
