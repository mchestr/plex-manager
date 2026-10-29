"use client"

import { useState, useTransition } from "react"

import { applyForAffiliate } from "@/actions/affiliate"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { AFFILIATE_NOTE_MAX } from "@/lib/validations/affiliates"

/** The note and Apply. Success refreshes the page through the action's revalidation. */
export function ApplyForm({ onHoursUnavailable }: { onHoursUnavailable: () => void }) {
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()
  const { showSuccess } = useToast()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await applyForAffiliate({ note })
      if (result.success) {
        setError(undefined)
        showSuccess("Application sent")
        return
      }
      if (result.code === "HOURS_UNAVAILABLE") onHoursUnavailable()
      setError(result.error)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="invites-apply-form">
      <FormField name="invites-apply-note" label="Note to the admins" optional error={error}>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={AFFILIATE_NOTE_MAX}
          rows={3}
          disabled={isPending}
          data-testid="invites-apply-note"
        />
      </FormField>
      <div>
        <Button type="submit" loading={isPending} loadingLabel="Applying" data-testid="invites-apply-submit">
          Apply
        </Button>
      </div>
    </form>
  )
}
