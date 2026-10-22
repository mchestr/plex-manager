"use client"

import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SettingsFormFooter } from "@/components/ui/settings-section"
import { SERVER_LABELS, useServerForm, type ServerFormValues, type ServerType, type StoredServer } from "@/hooks/admin/use-server-form"

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
  hasStoredSecret: boolean
  disabled?: boolean
}

/**
 * A service's fields, always open (UI-31): name, local URL, then the public
 * URL and the token or API key, or Prometheus's query. P10.20 moves the
 * secret onto SecretInput.
 */
export function ServerFormFields({ type, values, set, hasStoredSecret, disabled }: ServerFormFieldsProps) {
  const label = SERVER_LABELS[type]
  const id = (field: string) => `${type}-${field}`
  const secretLabel = type === "plex" ? "Plex token" : "API key"

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField name={id("name")} label="Name">
        <Input value={values.name} onValueChange={(name) => set({ name })} placeholder={`My ${label} server`} required disabled={disabled} data-testid={`settings-${type}-name`} />
      </FormField>
      <FormField name={id("url")} label="Local URL">
        <Input value={values.url} onValueChange={(url) => set({ url })} placeholder={PLACEHOLDERS[type]} required disabled={disabled} data-testid={`settings-${type}-url`} />
      </FormField>
      {type === "prometheus" ? (
        <FormField name={id("query")} label="PromQL query" description={'For example up{job="plex"}'} className="md:col-span-2">
          <Input value={values.query} onValueChange={(query) => set({ query })} placeholder='up{job="plex"}' required disabled={disabled} data-testid="settings-prometheus-query" />
        </FormField>
      ) : (
        <>
          <FormField name={id("public-url")} label="Public URL" optional description="Shown to members" className="md:col-span-2">
            <Input value={values.publicUrl} onValueChange={(publicUrl) => set({ publicUrl })} placeholder={`https://${type}.example.com`} disabled={disabled} data-testid={`settings-${type}-public-url`} />
          </FormField>
          <FormField
            name={id("secret")}
            label={secretLabel}
            description={hasStoredSecret ? `Leave blank to keep the saved ${type === "plex" ? "token" : "key"}.` : undefined}
            className="md:col-span-2"
          >
            <Input
              type="password"
              value={values.secret}
              onValueChange={(secret) => set({ secret })}
              placeholder={hasStoredSecret ? "Saved" : `${label} ${secretLabel}`}
              required={!hasStoredSecret}
              disabled={disabled}
              autoComplete="off"
              data-testid={`settings-${type}-secret`}
            />
          </FormField>
        </>
      )}
    </div>
  )
}

/** A service's form on its own, for the Other integrations Sheet. */
export function ServerForm({ type, server }: { type: ServerType; server: StoredServer | null }) {
  const { values, set, form, hasStoredSecret } = useServerForm(type, server)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (form.isDirty) form.onSave()
      }}
      className="flex flex-col gap-6"
      data-testid={`settings-${type}-form`}
    >
      <ServerFormFields type={type} values={values} set={set} hasStoredSecret={hasStoredSecret} disabled={form.isPending} />
      <SettingsFormFooter id={type} form={form} className="px-0" />
    </form>
  )
}
