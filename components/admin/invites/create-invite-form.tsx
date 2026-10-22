"use client"

import { use, useActionState, useState } from "react"

import { createInvite } from "@/actions/admin/invites"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogFooter } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { Switch } from "@/components/ui/switch"
import type { ExpiresIn } from "@/lib/validations/invite"
import type { LibraryListing } from "@/types/invite"

import { ExpirySelect } from "./expiry-select"
import { LibraryPicker, type LibrarySelection } from "./library-picker"

type ServerType = "PLEX" | "JELLYFIN"

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
  jellyfinLibraries: Promise<LibraryListing>
  onCreated: (invite: CreatedInvite) => void
}

/**
 * The create-invite form (P10.1): a `<form action>` with `useActionState`.
 * The library listings arrive as promises read with `use()`, so the list
 * page never waits for Plex or Jellyfin; a failed Jellyfin read disables
 * that option and says why. Errors render inside the dialog (UI-42).
 */
export function CreateInviteForm({ plexLibraries, jellyfinLibraries, onCreated }: CreateInviteFormProps) {
  const plexListing = use(plexLibraries)
  const jellyfinListing = use(jellyfinLibraries)
  const [serverType, setServerType] = useState<ServerType>("PLEX")
  const [libraries, setLibraries] = useState<LibrarySelection>("all")
  const [allowDownloads, setAllowDownloads] = useState(false)
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("48h")
  // Controlled, because React resets an action form's uncontrolled fields after each submit
  const [code, setCode] = useState("")
  const [maxUses, setMaxUses] = useState("1")
  const plex = serverType === "PLEX"

  const switchServer = (next: ServerType) => {
    setServerType(next)
    setLibraries("all")
    setAllowDownloads(false)
  }

  const [state, formAction, pending] = useActionState(async (): Promise<FormState> => {
    const ids = libraries === "all" ? undefined : libraries
    if (ids?.length === 0) return { error: null, fieldErrors: { libraries: ["Pick at least one library, or All libraries."] } }
    const result = await createInvite({
      code: code.trim() || undefined,
      serverType,
      maxUses: Number(maxUses),
      expiresIn,
      ...(plex ? { librarySectionIds: ids?.map(Number), allowDownloads } : { jellyfinLibraryIds: ids }),
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
      <div className="flex flex-col gap-2">
        <span id="invite-server-label" className="text-ui font-medium text-foreground">
          Server
        </span>
        <SegmentedControl
          aria-labelledby="invite-server-label"
          value={serverType}
          onValueChange={(value) => switchServer(value === "JELLYFIN" ? "JELLYFIN" : "PLEX")}
          disabled={pending}
        >
          <Segment value="PLEX" data-testid="invite-server-type-plex">
            Plex
          </Segment>
          <Segment value="JELLYFIN" disabled={!jellyfinListing.ok} data-testid="invite-server-type-jellyfin">
            Jellyfin
          </Segment>
        </SegmentedControl>
        {!jellyfinListing.ok && (
          <p className="text-label text-muted-foreground" data-testid="invite-jellyfin-unavailable">
            Jellyfin is unavailable. {jellyfinListing.reason}
          </p>
        )}
      </div>
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
        key={serverType}
        listing={plex ? plexListing : jellyfinListing}
        value={libraries}
        onChange={setLibraries}
        serverLabel={plex ? "Plex" : "Jellyfin"}
        error={fieldError("libraries") ?? fieldError(plex ? "librarySectionIds" : "jellyfinLibraryIds")}
      />
      {plex && (
        <Field className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <FieldLabel>Allow downloads</FieldLabel>
            <FieldDescription>Members who join can download from the server.</FieldDescription>
          </div>
          <Switch checked={allowDownloads} onCheckedChange={setAllowDownloads} data-testid="invite-allow-downloads" />
        </Field>
      )}
      <DialogFooter>
        <DialogClose render={<Button data-testid="create-invite-cancel" type="button" variant="ghost" disabled={pending} />}>Cancel</DialogClose>
        <Button type="submit" loading={pending} loadingLabel="Creating" data-testid="create-invite-submit">
          Create invite
        </Button>
      </DialogFooter>
    </form>
  )
}
