"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { savePlexServer, saveRadarr, saveSonarr, saveTautulli, saveOverseerr, testSetupConnection } from "@/actions/setup"
import type { TestResult } from "@/components/ui/settings-section"
import { SERVER_LABELS, secretNoun, type ServerFormErrors, type ServerFormValues, type StoredServer } from "@/hooks/admin/use-server-form"
import { needsSecretReentry, safeOrigin } from "@/lib/security/saved-secret"
import { connectionTestCopy, errorCopy, type ConnectionTestCode } from "@/lib/ui/error-copy"
import { nextStepId, type DevDefaults } from "@/types/setup"

export type SetupServiceKind = "plex" | "tautulli" | "overseerr" | "sonarr" | "radarr"

const FIELDS: readonly (keyof ServerFormValues)[] = ["name", "url", "publicUrl", "secret"]

/** An action's field errors on the form's fields: `token` and `apiKey` are the secret. */
function formErrors(fieldErrors: Record<string, string[] | undefined> | undefined): ServerFormErrors {
  const errors: ServerFormErrors = {}
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    const field = key === "token" || key === "apiKey" ? "secret" : FIELDS.find((name) => name === key)
    if (field && messages?.[0]) errors[field] = messages[0]
  }
  return errors
}

function save(kind: SetupServiceKind, values: ServerFormValues) {
  const base = { name: values.name, url: values.url }
  const secret = values.secret.trim() || undefined
  const publicUrl = values.publicUrl.trim() || undefined
  switch (kind) {
    case "plex":
      return savePlexServer({ ...base, token: secret, publicUrl })
    case "tautulli":
      return saveTautulli({ ...base, apiKey: secret, publicUrl })
    case "overseerr":
      return saveOverseerr({ ...base, apiKey: secret, publicUrl })
    case "sonarr":
      return saveSonarr({ ...base, apiKey: secret, publicUrl })
    case "radarr":
      return saveRadarr({ ...base, apiKey: secret, publicUrl })
  }
}

function initialValues(kind: SetupServiceKind, stored: StoredServer | null, devDefaults: DevDefaults): ServerFormValues {
  if (stored) {
    return { name: stored.name, url: stored.url, publicUrl: stored.publicUrl ?? "", secret: "" }
  }
  const dev = devDefaults[kind]
  return { name: dev?.name ?? "", url: dev?.url ?? "", publicUrl: dev?.publicUrl ?? "", secret: (kind === "plex" ? dev?.token : dev?.apiKey) ?? "" }
}

/**
 * A setup service step's form (P10.25): the settings fields and their rules,
 * saved through the setup actions. A step revisited with Back starts from the
 * saved values with the secret blank ("Saved", last four); a changed host
 * blocks Test and Save until the secret is typed again (SEC-31), and the
 * server refuses it too. Test connection runs `testSetupConnection` with the
 * typed values; Save moves on to the next step.
 */
export function useSetupServiceForm(kind: SetupServiceKind, stored: StoredServer | null, devDefaults: DevDefaults) {
  const router = useRouter()
  const [values, setValues] = useState(() => initialValues(kind, stored, devDefaults))
  const [errors, setErrors] = useState<ServerFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const noun = secretNoun(kind)

  const currentOrigin = safeOrigin(values.url)
  const blocked = needsSecretReentry(stored?.secret, currentOrigin, values.secret)

  /** Changes fields and clears their errors and the last test. */
  const set = (patch: Partial<ServerFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
    setTestResult(null)
    setFormError(null)
  }

  const submit = () =>
    startSave(async () => {
      const result = await save(kind, values)
      if (result.success) {
        router.push(`/setup?step=${nextStepId(kind)}`)
        return
      }
      const fieldErrors = formErrors(result.fieldErrors)
      setErrors(fieldErrors)
      // A field error says it where it belongs; the alert is for the rest
      setFormError(Object.keys(fieldErrors).length === 0 ? result.error : null)
    })

  const test = () =>
    startTest(async () => {
      const failed = (code: ConnectionTestCode) => {
        const copy = connectionTestCopy(code, noun)
        setErrors({ [copy.field]: copy.fieldError })
        setTestResult({ ok: false, message: copy.title, detail: copy.fix })
      }
      const result = await testSetupConnection({
        service: kind,
        url: values.url,
        secret: values.secret.trim() || undefined,
      })
      if (result.success) {
        if (result.data.status === "unreachable") return failed(result.data.code)
        setErrors({})
        setTestResult({ ok: true, message: `Connected to ${SERVER_LABELS[kind]} with these settings.` })
        return
      }
      if (result.code === "SECRET_REQUIRED") return failed("SECRET_REQUIRED")
      setErrors(formErrors(result.fieldErrors))
      const copy = errorCopy(result.code, { audience: "admin" })
      setTestResult({ ok: false, message: copy.title, detail: copy.description })
    })

  return {
    values,
    set,
    errors,
    formError,
    currentOrigin,
    blockedReason: blocked ? `Enter the ${kind === "plex" ? "token" : "API key"} to test or save` : undefined,
    testResult,
    saving,
    testing,
    submit,
    test,
  }
}

export type SetupServiceForm = ReturnType<typeof useSetupServiceForm>
