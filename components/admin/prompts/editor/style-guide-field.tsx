"use client"

import type { KeyboardEvent } from "react"

import { FormField } from "@/components/ui/form-field"
import { Textarea } from "@/components/ui/textarea"
import { STYLE_GUIDE_MAX_CHARS } from "@/lib/validations/prompt"

const WARN_AT = Math.floor(STYLE_GUIDE_MAX_CHARS * 0.9)

const number = new Intl.NumberFormat("en-US")

/** "820 of 1,200 characters". */
function characterCount(length: number): string {
  return `${number.format(length)} of ${number.format(STYLE_GUIDE_MAX_CHARS)} characters`
}

/** What the polite live region says: only at 90% and at the limit, so typing isn't read out. */
function announcement(length: number): string {
  if (length >= STYLE_GUIDE_MAX_CHARS) return `Limit reached: ${characterCount(length)}`
  if (length >= WARN_AT) return `Nearly at the limit: ${characterCount(length)}`
  return ""
}

interface StyleGuideFieldProps {
  value: string
  onChange: (value: string) => void
  error?: string
  readOnly?: boolean
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

/** The style guide's text, with its character counter and inline error. */
export function StyleGuideField({ value, onChange, error, readOnly = false, onKeyDown }: StyleGuideFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <FormField
        name="template"
        label="Style guide"
        description={<span data-testid="admin-prompt-editor-counter">{characterCount(value.length)}</span>}
        error={error}
      >
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          readOnly={readOnly}
          rows={12}
          spellCheck
          className="font-mono text-ui"
          data-testid="admin-prompt-editor-style-guide"
        />
      </FormField>
      <span aria-live="polite" className="sr-only">
        {readOnly ? "" : announcement(value.length)}
      </span>
    </div>
  )
}
