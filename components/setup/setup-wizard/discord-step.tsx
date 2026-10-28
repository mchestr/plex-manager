"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { saveDiscordIntegration } from "@/actions/setup"
import {
  DiscordIntegrationFields,
  initialDiscordValues,
  type DiscordValues,
  type StoredDiscordIntegration,
} from "@/components/admin/settings/discord-integration-form"
import { SetupStepFrame } from "@/components/setup/setup-wizard/setup-step-frame"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { nextStepId, type DevDefaults } from "@/types/setup"

type DiscordErrors = Partial<Record<keyof DiscordValues, string>>

function startValues(stored: StoredDiscordIntegration | null, devDefaults: DevDefaults): DiscordValues {
  const values = initialDiscordValues(stored)
  const dev = devDefaults.discord
  if (stored || !dev) return values
  return {
    ...values,
    isEnabled: dev.isEnabled ?? values.isEnabled,
    botEnabled: dev.botEnabled ?? values.botEnabled,
    clientId: dev.clientId ?? "",
    clientSecret: dev.clientSecret ?? "",
    guildId: dev.guildId ?? "",
    serverInviteCode: dev.serverInviteCode ?? "",
    platformName: dev.platformName ?? values.platformName,
    instructions: dev.instructions ?? "",
  }
}

const ROWS = [
  { key: "isEnabled", label: "Linked roles", hint: "Members link their Discord account and get a role while they have access." },
  { key: "botEnabled", label: "Support bot", hint: "Answers member questions in your support channel." },
] as const

interface DiscordStepProps {
  stored: StoredDiscordIntegration | null
  devDefaults: DevDefaults
}

/** The Discord step: the settings' two switches and fields, saved through the setup action. */
export function DiscordStep({ stored, devDefaults }: DiscordStepProps) {
  const router = useRouter()
  const [values, setValues] = useState(() => startValues(stored, devDefaults))
  const [errors, setErrors] = useState<DiscordErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const set = (patch: Partial<DiscordValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in patch))))
  }

  const submit = () =>
    startSave(async () => {
      const result = await saveDiscordIntegration({
        ...values,
        clientSecret: values.clientSecret.trim() || undefined,
        botToken: values.botToken.trim() || undefined,
      })
      if (result.success) {
        router.push(`/setup?step=${nextStepId("discord")}`)
        return
      }
      const fieldErrors = Object.fromEntries(
        Object.entries(result.fieldErrors ?? {}).flatMap(([field, messages]) => (field in values && messages?.[0] ? [[field, messages[0]]] : []))
      )
      setErrors(fieldErrors)
      setFormError(Object.keys(fieldErrors).length === 0 ? result.error : null)
    })

  return (
    <SetupStepFrame
      position="discord"
      heading="Connect Discord"
      description="Both need an application in the Discord Developer Portal."
      onSubmit={submit}
      busy={saving}
      primary={
        <Button type="submit" loading={saving} loadingLabel="Saving" data-testid="setup-form-submit">
          Save and continue
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col divide-y rounded-lg border">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 p-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-ui font-medium text-foreground">
                  {row.label}
                </span>
                <span className="text-label text-muted-foreground">{row.hint}</span>
              </div>
              <Switch
                checked={values[row.key]}
                onCheckedChange={(checked) => set({ [row.key]: checked })}
                label={row.label}
                disabled={saving}
                data-testid={`setup-discord-${row.key === "isEnabled" ? "toggle" : "bot-toggle"}`}
              />
            </div>
          ))}
        </div>
        <DiscordIntegrationFields integration={stored} state={{ values, set, errors, form: { isPending: saving } }} />
        {formError && (
          <Alert tone="destructive" data-testid="setup-discord-error">
            {formError}
          </Alert>
        )}
      </div>
    </SetupStepFrame>
  )
}
