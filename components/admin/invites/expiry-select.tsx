"use client"

import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ExpiresIn } from "@/lib/validations/invite"

const EXPIRY_ITEMS: { value: ExpiresIn; label: string }[] = [
  { value: "1d", label: "24 hours" },
  { value: "48h", label: "48 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
]

/** The create-invite dialog's "Expires" Select, over `createInvite`'s options. */
export function ExpirySelect({ value, onChange }: { value: ExpiresIn; onChange: (value: ExpiresIn) => void }) {
  return (
    <Field name="expiresIn">
      <FieldLabel nativeLabel={false} render={<div />}>
        Expires
      </FieldLabel>
      <Select items={EXPIRY_ITEMS} value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger aria-label="Expires" data-testid="invite-expiry-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPIRY_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`invite-expiry-option-${item.value}`}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
