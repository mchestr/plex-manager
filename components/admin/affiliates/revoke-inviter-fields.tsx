"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AFFILIATE_REASON_MAX } from "@/lib/validations/affiliates"

export interface RevokeInviterValue {
  revoke: boolean
  reason: string
}

export const NO_REVOKE: RevokeInviterValue = { revoke: false, reason: "" }

interface RevokeInviterFieldsProps {
  inviterName: string
  value: RevokeInviterValue
  onChange: (value: RevokeInviterValue) => void
  disabled?: boolean
  /** Prefix for the test ids: `${testId}` on the checkbox, `${testId}-reason` on the reason. */
  testId: string
}

/**
 * "Invited by Sam", and the option to revoke Sam's affiliate status with an
 * optional reason, for the Disable and Remove dialogs. Off by default.
 */
export function RevokeInviterFields({ inviterName, value, onChange, disabled, testId }: RevokeInviterFieldsProps) {
  return (
    <div className="flex flex-col gap-3" data-testid={`${testId}-fields`}>
      <p className="text-ui text-muted-foreground">Invited by {inviterName}</p>
      <div className="flex items-start gap-3">
        <Checkbox
          id={testId}
          checked={value.revoke}
          onCheckedChange={(revoke) => onChange({ ...value, revoke })}
          disabled={disabled}
          className="mt-0.5"
          data-testid={testId}
        />
        <Label htmlFor={testId}>Also revoke {inviterName}&apos;s affiliate status</Label>
      </div>
      {value.revoke && (
        <FormField name={`${testId}-reason`} label={`Reason for ${inviterName}`} optional description="They see this reason.">
          <Textarea
            value={value.reason}
            onChange={(event) => onChange({ ...value, reason: event.target.value })}
            maxLength={AFFILIATE_REASON_MAX}
            disabled={disabled}
            rows={2}
            data-testid={`${testId}-reason`}
          />
        </FormField>
      )}
    </div>
  )
}
