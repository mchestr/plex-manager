"use client"

import type { ReactNode } from "react"

import { SheetForm, type SheetFormControls } from "@/components/admin/settings/sheet-form"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { SettingsFormFooter } from "@/components/ui/settings-form-footer"
import {
  SERVER_LABELS,
  secretNoun,
  useServerForm,
  type ServerFormErrors,
  type ServerFormValues,
  type ServerType,
  type StoredServer,
} from "@/hooks/admin/use-server-form"
import type { SavedSecret } from "@/lib/security/saved-secret"

const PLACEHOLDERS: Record<ServerType, string> = {
  plex: "https://example.com:32400",
  jellyfin: "http://example.com:8096",
  tautulli: "http://example.com:8181",
  overseerr: "http://example.com:5055",
  sonarr: "http://example.com:8989",
  radarr: "http://example.com:7878",
}

interface ServerFormFieldsProps {
  type: ServerType
  values: ServerFormValues
  set: (patch: Partial<ServerFormValues>) => void
  errors: ServerFormErrors
  /** The stored secret's last four and origin, from the server. */
  saved: SavedSecret | null | undefined
  /** The live origin of the URL field (`safeOrigin`). */
  currentOrigin: string | null
  disabled?: boolean
  /** Test ids are `<prefix>-<type>-<field>`; setup passes `setup`. Default `settings`. */
  testIdPrefix?: string
}

/**
 * A service's fields in a two-column FormField grid (UI-13): name, local
 * URL, then the public URL and the token or API key as a `SecretInput`.
 * Errors from Test and Save show on their field. A settings section shows
 * them in edit mode and a Sheet as its form; setup (P10.25) reuses them.
 */
export function ServerFormFields({ type, values, set, errors, saved, currentOrigin, disabled, testIdPrefix = "settings" }: ServerFormFieldsProps) {
  const label = SERVER_LABELS[type]
  const id = (field: string) => `${type}-${field}`
  const noun = secretNoun(type)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField name={id("name")} label="Name" error={errors.name}>
        <Input value={values.name} onValueChange={(name) => set({ name })} placeholder={`My ${label} server`} required disabled={disabled} data-testid={`${testIdPrefix}-${type}-name`} />
      </FormField>
      <FormField name={id("url")} label="Local URL" error={errors.url}>
        <Input value={values.url} onValueChange={(url) => set({ url })} placeholder={PLACEHOLDERS[type]} required disabled={disabled} data-testid={`${testIdPrefix}-${type}-url`} />
      </FormField>
      <FormField name={id("public-url")} label="Public URL" optional description="Members see this URL." error={errors.publicUrl}>
        <Input value={values.publicUrl} onValueChange={(publicUrl) => set({ publicUrl })} placeholder={`https://${type}.example.com`} disabled={disabled} data-testid={`${testIdPrefix}-${type}-public-url`} />
      </FormField>
      <FormField name={id("secret")} label={noun} error={errors.secret}>
        <SecretInput
          value={values.secret}
          onValueChange={(secret) => set({ secret })}
          saved={saved}
          currentOrigin={currentOrigin}
          noun={type === "plex" ? "token" : "key"}
          placeholder={`${label} ${noun}`}
          required
          disabled={disabled}
          data-testid={`${testIdPrefix}-${type}-secret`}
        />
      </FormField>
    </div>
  )
}

interface ServerFormProps extends SheetFormControls {
  type: ServerType
  server: StoredServer | null
  /** "Last saved ... by ..." from the audit log, shown while the form is clean. */
  footerMeta?: ReactNode
}

/**
 * A service's form on its own: the edit mode of an Other integrations row,
 * in its Sheet. Test connection tries the typed values; Save with nothing
 * changed, or a save that works, calls `onDone`, and a failed one keeps the
 * form open with the errors on their fields.
 */
export function ServerForm({ type, server, footerMeta, onDone, onCancel, onDirtyChange, onPendingChange }: ServerFormProps) {
  const { values, set, errors, currentOrigin, test, form } = useServerForm(type, server)
  return (
    <SheetForm form={form} onDone={onDone} onDirtyChange={onDirtyChange} onPendingChange={onPendingChange} data-testid={`settings-${type}-form`}>
      <ServerFormFields type={type} values={values} set={set} errors={errors} saved={server?.secret} currentOrigin={currentOrigin} disabled={form.isPending} />
      <SettingsFormFooter
        id={type}
        title={SERVER_LABELS[type]}
        form={form}
        editing
        onCancel={onCancel}
        onTest={test}
        footerMeta={footerMeta}
        className="px-0"
      />
    </SheetForm>
  )
}
