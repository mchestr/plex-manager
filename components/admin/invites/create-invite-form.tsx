"use client"

import { use, useActionState, useState } from "react"

import { createInvite } from "@/actions/admin/invites"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogFooter } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ExpiresIn } from "@/lib/validations/invite"
import type { LibraryListing } from "@/types/invite"

import { ExpirySelect } from "./expiry-select"
import { LibraryPicker, type LibrarySelection } from "./library-picker"

interface FormState {
  error: string | null
  fieldErrors: Record<string, string[] | undefined>
}

const NO_ERRORS: FormState = { error: null, fieldErrors: {} }

export interface CreatedInvite {
  id: string
  code: string
}

interface CreateInviteFormProps {
  plexLibraries: Promise<LibraryListing>
  onCreated: (invite: CreatedInvite) => void
}

/**
 * The create-invite form (P10.1): a `<form action>` with `useActionState`.
 * The library listing arrives as a promise read with `use()`, so the list
 * page never waits for Plex. Errors render inside the dialog (UI-42).
 */
export function CreateInviteForm({ plexLibraries, onCreated }: CreateInviteFormProps) {
  const plexListing = use(plexLibraries)
  const [libraries, setLibraries] = useState<LibrarySelection>("all")
  const [allowDownloads, setAllowDownloads] = useState(false)
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("48h")
  // Controlled, because React resets an action form's uncontrolled fields after each submit
  const [code, setCode] = useState("")
  const [maxUses, setMaxUses] = useState("1")

  const [state, formAction, pending] = useActionState(async (): Promise<FormState> => {
    const ids = libraries === "all" ? undefined : libraries
    if (ids?.length === 0) return { error: null, fieldErrors: { libraries: ["Pick at least one library, or All libraries."] } }
    const result = await createInvite({
      code: code.trim() || undefined,
      maxUses: Number(maxUses),
      expiresIn,
      librarySectionIds: ids?.map(Number),
      allowDownloads,
    })
    if (!result.success) return { error: result.error, fieldErrors: result.fieldErrors ?? {} }
    onCreated(result.data)
    return NO_ERRORS
  }, NO_ERRORS)

  const fieldError = (name: string) => state.fieldErrors[name]?.[0]
  const hasFieldErrors = Object.values(state.fieldErrors).some((messages) => messages?.length)

  return (
    <form action={formAction} className="flex flex-col gap-6" data-testid="create-invite-form">
      {state.error && !hasFieldErrors && (
        <Alert tone="destructive" data-testid="create-invite-error">
          {state.error}
        </Alert>
      )}
      <FormField name="code" label="Code" optional description="Leave it blank for a random 8-character code." error={fieldError("code")}>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          className="font-mono"
          data-testid="invite-code-input"
        />
      </FormField>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField name="maxUses" label="Uses" description="How many people can join with it" error={fieldError("maxUses")}>
          <Input
            type="number"
            min={1}
            max={1000}
            step={1}
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
            required
            data-testid="invite-max-uses-input"
          />
        </FormField>
        <ExpirySelect value={expiresIn} onChange={setExpiresIn} />
      </div>
      <LibraryPicker
        listing={plexListing}
        value={libraries}
        onChange={setLibraries}
        serverLabel="Plex"
        error={fieldError("libraries") ?? fieldError("librarySectionIds")}
      />
      <Field className="flex-row items-start justify-between gap-4">
        <FieldLabel>Allow downloads</FieldLabel>
        <Switch checked={allowDownloads} onCheckedChange={setAllowDownloads} data-testid="invite-allow-downloads" />
      </Field>
      <DialogFooter>
        <DialogClose render={<Button data-testid="create-invite-cancel" type="button" variant="ghost" disabled={pending} />}>Cancel</DialogClose>
        <Button type="submit" loading={pending} loadingLabel="Creating" data-testid="create-invite-submit">
          Create invite
        </Button>
      </DialogFooter>
    </form>
  )
}
