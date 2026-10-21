"use client"

import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

interface PromptDetailsFieldsProps {
  name: string
  description: string
  isActive: boolean
  onChange: (patch: Partial<{ name: string; description: string; isActive: boolean }>) => void
  errors: { name?: string; description?: string }
  readOnly?: boolean
}

/** Name, description and the "Use for Rewind" switch. */
export function PromptDetailsFields({ name, description, isActive, onChange, errors, readOnly = false }: PromptDetailsFieldsProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormField name="name" label="Name" error={errors.name}>
        <Input
          value={name}
          onChange={(event) => onChange({ name: event.target.value })}
          readOnly={readOnly}
          autoComplete="off"
          data-testid="admin-prompt-editor-name"
        />
      </FormField>
      <FormField name="description" label="Description" optional error={errors.description}>
        <Input
          value={description}
          onChange={(event) => onChange({ description: event.target.value })}
          readOnly={readOnly}
          autoComplete="off"
          data-testid="admin-prompt-editor-description"
        />
      </FormField>
      {!readOnly && (
        <Field name="isActive" className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <FieldLabel>Use for Rewind</FieldLabel>
            <FieldDescription>Rewinds generated after you save use this style guide.</FieldDescription>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={(checked) => onChange({ isActive: checked })}
            data-testid="admin-prompt-editor-active"
          />
        </Field>
      )}
    </div>
  )
}
