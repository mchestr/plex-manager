"use client"

import type { ReactNode } from "react"

import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { SettingsFormFooter } from "@/components/ui/settings-section"
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
  prometheus: "http://example.com:9090",
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
}

/**
 * A service's fields, always open (UI-31), in a two-column FormField grid
 * (UI-13): name, local URL, then the public URL and the token or API key as
 * a `SecretInput`, or Prometheus's query. Errors from Test and Save show on
 * their field. Setup (P10.25) reuses these fields.
 */
export function ServerFormFields({ type, values, set, errors, saved, currentOrigin, disabled }: ServerFormFieldsProps) {
  const label = SERVER_LABELS[type]
  const id = (field: string) => `${type}-${field}`
  const noun = secretNoun(type)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField name={id("name")} label="Name" error={errors.name}>
        <Input value={values.name} onValueChange={(name) => set({ name })} placeholder={`My ${label} server`} required disabled={disabled} data-testid={`settings-${type}-name`} />
      </FormField>
      <FormField name={id("url")} label="Local URL" error={errors.url}>
        <Input value={values.url} onValueChange={(url) => set({ url })} placeholder={PLACEHOLDERS[type]} required disabled={disabled} data-testid={`settings-${type}-url`} />
      </FormField>
      {type === "prometheus" ? (
        <FormField name={id("query")} label="PromQL query" description={'For example up{job="plex"}'} error={errors.query} className="md:col-span-2">
          <Input value={values.query} onValueChange={(query) => set({ query })} placeholder='up{job="plex"}' required disabled={disabled} data-testid="settings-prometheus-query" />
        </FormField>
      ) : (
        <>
          <FormField name={id("public-url")} label="Public URL" optional description="Shown to members" error={errors.publicUrl}>
            <Input value={values.publicUrl} onValueChange={(publicUrl) => set({ publicUrl })} placeholder={`https://${type}.example.com`} disabled={disabled} data-testid={`settings-${type}-public-url`} />
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
              data-testid={`settings-${type}-secret`}
            />
          </FormField>
        </>
      )}
    </div>
  )
}

/** A service's form on its own, for the Other integrations Sheet. */
export function ServerForm({ type, server, footerMeta }: { type: ServerType; server: StoredServer | null; footerMeta?: ReactNode }) {
  const { values, set, errors, currentOrigin, test, form } = useServerForm(type, server)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (form.isDirty) form.onSave()
      }}
      noValidate
      className="flex flex-col gap-6"
      data-testid={`settings-${type}-form`}
    >
      <ServerFormFields type={type} values={values} set={set} errors={errors} saved={server?.secret} currentOrigin={currentOrigin} disabled={form.isPending} />
      <SettingsFormFooter id={type} form={form} onTest={test} footerMeta={footerMeta} className="px-0" />
    </form>
  )
}
