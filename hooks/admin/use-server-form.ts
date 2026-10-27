"use client"

import { useState } from "react"

import { updateJellyfinServer, updateOverseerr, updatePlexServer, updateRadarr, updateSonarr, updateTautulli } from "@/actions/admin/admin-servers"
import { testServiceConnection } from "@/actions/admin/test-connection"
import type { TestResult } from "@/components/ui/settings-section"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import { needsSecretReentry, safeOrigin, type SavedSecret } from "@/lib/security/saved-secret"
import { connectionTestCopy, errorCopy, type ConnectionTestCode } from "@/lib/ui/error-copy"

export type ServerType = "plex" | "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr"

/**
 * The active server config, with its secret replaced by `{ last4, origin }`
 * (`describeSecret`), so a blank secret field keeps it for that origin only.
 */
export interface StoredServer {
  name: string
  url: string
  publicUrl?: string | null
  secret?: SavedSecret | null
}

export interface ServerFormValues {
  name: string
  url: string
  publicUrl: string
  /** The Plex token or the API key, as typed; blank keeps the stored one. */
  secret: string
}

type Field = keyof ServerFormValues
export type ServerFormErrors = Partial<Record<Field, string>>

export const SERVER_LABELS: Record<ServerType, string> = {
  plex: "Plex",
  jellyfin: "Jellyfin",
  tautulli: "Tautulli",
  overseerr: "Overseerr",
  sonarr: "Sonarr",
  radarr: "Radarr",
}

/** "Plex token" or "API key", for labels and copy. */
export const secretNoun = (type: ServerType) => (type === "plex" ? "Plex token" : "API key")

const API_KEY_ACTIONS = {
  jellyfin: updateJellyfinServer,
  tautulli: updateTautulli,
  overseerr: updateOverseerr,
  sonarr: updateSonarr,
  radarr: updateRadarr,
}

function save(type: ServerType, values: ServerFormValues) {
  const secret = values.secret.trim() || undefined
  const publicUrl = values.publicUrl || undefined
  if (type === "plex") return updatePlexServer({ name: values.name, url: values.url, token: secret, publicUrl })
  return API_KEY_ACTIONS[type]({ name: values.name, url: values.url, apiKey: secret, publicUrl })
}

const FIELDS: readonly Field[] = ["name", "url", "publicUrl", "secret"]

/** The form field an action's field error belongs to: `token` and `apiKey` are the secret. */
function fieldOf(key: string): Field | undefined {
  if (key === "token" || key === "apiKey") return "secret"
  return FIELDS.find((field) => field === key)
}

/** An action's `fieldErrors`, keyed by the form's fields. */
function formErrors(fieldErrors: Record<string, string[]> | undefined): ServerFormErrors {
  const errors: ServerFormErrors = {}
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    const field = fieldOf(key)
    if (field && messages[0]) errors[field] = messages[0]
  }
  return errors
}

/**
 * One service's form: values, dirty state, Discard (which also clears the
 * field errors) and Save, field errors from the actions, and Test connection
 * with the values in the form (`testServiceConnection`): the saved ones
 * while the section is read-only, the typed ones while editing.
 *
 * While the URL's origin differs from the one the secret was saved for and
 * nothing is typed, `form.blockedReason` disables Test and Save (SEC-31); the
 * server refuses the same case with `SECRET_REQUIRED` on the secret field.
 */
export function useServerForm(type: ServerType, server: StoredServer | null) {
  const toast = useToast()
  const [errors, setErrors] = useState<ServerFormErrors>({})
  const noun = secretNoun(type)
  const initial: ServerFormValues = {
    name: server?.name ?? "",
    url: server?.url ?? "",
    publicUrl: server?.publicUrl ?? "",
    secret: "",
  }

  const settings = useSettingsForm(initial, async (values) => {
    const result = await save(type, values)
    if (!result.success) {
      const fieldErrors = formErrors(result.fieldErrors)
      setErrors(fieldErrors)
      // A field error says it where it belongs; the toast is for the rest
      if (Object.keys(fieldErrors).length === 0) toast.showError(result.error)
      return { ok: false }
    }
    setErrors({})
    toast.showSuccess(`${SERVER_LABELS[type]} settings saved`)
    return { ok: true, keep: { ...values, secret: "" } }
  })

  const currentOrigin = safeOrigin(settings.values.url)
  const blocked = needsSecretReentry(server?.secret, currentOrigin, settings.values.secret)

  /** Changes fields and clears their errors. */
  const set = (patch: Partial<ServerFormValues>) => {
    settings.set(patch)
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  const test = async (): Promise<TestResult> => {
    const { values } = settings
    const result = await testServiceConnection({
      service: type,
      url: values.url,
      secret: values.secret.trim() || undefined,
    })
    const failed = (code: ConnectionTestCode): TestResult => {
      const copy = connectionTestCopy(code, noun)
      setErrors({ [copy.field]: copy.fieldError })
      return { ok: false, message: copy.title, detail: copy.fix }
    }
    if (result.success) {
      if (result.data.status === "unreachable") return failed(result.data.code)
      setErrors({})
      return { ok: true, message: `Connected to ${SERVER_LABELS[type]} with these settings.` }
    }
    if (result.code === "SECRET_REQUIRED") return failed("SECRET_REQUIRED")
    setErrors(formErrors(result.fieldErrors))
    const copy = errorCopy(result.code, { audience: "admin" })
    return { ok: false, message: copy.title, detail: copy.description }
  }

  return {
    values: settings.values,
    set,
    errors,
    currentOrigin,
    test,
    form: {
      ...settings.form,
      onDiscard: () => {
        settings.form.onDiscard()
        setErrors({})
      },
      blockedReason: blocked ? `Enter the ${type === "plex" ? "token" : "API key"} to test or save` : undefined,
    },
  }
}
