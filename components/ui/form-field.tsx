import type { ReactElement, ReactNode } from "react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"

interface FormFieldProps {
  /** Submitted as the control's name. */
  name: string
  label: string
  optional?: boolean
  description?: ReactNode
  /** Marks the control invalid and shows the message under it. */
  error?: string
  /** The saved value this field differs from: "Changed from http://localhost:5055". */
  changedFrom?: string
  /** One control: Input, Textarea, Select or Switch. */
  children: ReactElement
  className?: string
}

/**
 * The settings-form field (ui-design-system 5.5): a label, one control, an
 * optional description, a "Changed from" note and the error, all wired to the
 * control through `Field`.
 */
export function FormField({ name, label, optional, description, error, changedFrom, children, className }: FormFieldProps) {
  return (
    <Field name={name} invalid={!!error} className={className}>
      <FieldLabel optional={optional}>{label}</FieldLabel>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
      {changedFrom !== undefined && <FieldDescription>Changed from {changedFrom}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
