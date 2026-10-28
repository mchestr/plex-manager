"use client"

import { useEffect, useRef } from "react"

import { ServerFormFields } from "@/components/admin/settings/server-form"
import { SetupStepFrame } from "@/components/setup/setup-wizard/setup-step-frame"
import { useSetupServiceForm, type SetupServiceForm, type SetupServiceKind } from "@/components/setup/setup-wizard/use-setup-service-form"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { StoredServer } from "@/hooks/admin/use-server-form"
import { icons } from "@/lib/ui/icons"
import type { DevDefaults } from "@/types/setup"

const COPY: Record<Exclude<SetupServiceKind, "plex">, { heading: string; description: string }> = {
  tautulli: {
    heading: "Connect Tautulli",
    description: "Rewind and member stats use its watch history. Find the API key in Tautulli under Settings, Web Interface.",
  },
  overseerr: {
    heading: "Connect Overseerr",
    description: "Members use it to request movies and shows. Find the API key in Overseerr under Settings, General.",
  },
  sonarr: {
    heading: "Connect Sonarr",
    description: "The admin pages show its download queue and missing shows. Find the API key in Sonarr under Settings, General.",
  },
  radarr: {
    heading: "Connect Radarr",
    description: "The admin pages show its download queue and missing movies. Find the API key in Radarr under Settings, General.",
  },
}

interface ServiceFieldsProps {
  kind: SetupServiceKind
  form: SetupServiceForm
  stored: StoredServer | null
}

/** The fields, Test connection and its inline result; the Plex token fallback uses these too. */
export function SetupServiceFields({ kind, form, stored }: ServiceFieldsProps) {
  const busy = form.saving || form.testing
  return (
    <div className="flex flex-col gap-4">
      <ServerFormFields
        type={kind}
        values={form.values}
        set={form.set}
        errors={form.errors}
        saved={stored?.secret}
        currentOrigin={form.currentOrigin}
        disabled={form.saving}
        testIdPrefix="setup"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          icon={<Icon icon={icons.testConnection} />}
          onClick={form.test}
          loading={form.testing}
          loadingLabel="Testing"
          disabled={busy || Boolean(form.blockedReason)}
          data-testid={`setup-${kind}-test`}
        >
          Test connection
        </Button>
        {form.blockedReason && <p className="text-label text-muted-foreground">{form.blockedReason}</p>}
      </div>
      <div role="status" className="empty:hidden" data-testid={`setup-${kind}-test-result`}>
        {form.testResult && (
          <Alert tone={form.testResult.ok ? "success" : "warning"} role="presentation" title={form.testResult.message}>
            {form.testResult.detail}
          </Alert>
        )}
      </div>
      {form.formError && (
        <Alert tone="destructive" data-testid={`setup-${kind}-error`}>
          {form.formError}
        </Alert>
      )}
    </div>
  )
}

interface ServiceConnectionFormProps {
  kind: Exclude<SetupServiceKind, "plex">
  stored: StoredServer | null
  devDefaults: DevDefaults
}

/**
 * Tautulli, Overseerr, Sonarr and Radarr (P10.25, DUP-05): one
 * form on the settings fields and rules, in the step's card.
 */
export function ServiceConnectionForm({ kind, stored, devDefaults }: ServiceConnectionFormProps) {
  const form = useSetupServiceForm(kind, stored, devDefaults)
  const autoSubmitted = useRef(false)
  const complete = Boolean(form.values.name.trim() && form.values.url.trim() && form.values.secret.trim())

  // A real effect: DEV_* auto-submit sends a fully pre-filled form once
  useEffect(() => {
    if (!devDefaults.autoSubmit || stored || !complete || autoSubmitted.current) return
    autoSubmitted.current = true
    // Not cleared on re-render: the guard above already spent the one try
    setTimeout(form.submit, 500)
  }, [devDefaults.autoSubmit, stored, complete, form.submit])

  return (
    <SetupStepFrame
      position={kind}
      heading={COPY[kind].heading}
      description={COPY[kind].description}
      onSubmit={() => !form.blockedReason && form.submit()}
      busy={form.saving}
      primary={
        <Button type="submit" loading={form.saving} loadingLabel="Saving" disabled={Boolean(form.blockedReason) || form.testing} data-testid="setup-form-submit">
          Save and continue
        </Button>
      }
    >
      <SetupServiceFields kind={kind} form={form} stored={stored} />
    </SetupStepFrame>
  )
}
