"use client"

import { useMemo, useState, useSyncExternalStore, useTransition } from "react"

import { setUserTimezone } from "@/actions/account"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

/** The Select value that stands for "use the server zone", stored as null. */
const SERVER = "server"

interface TimezoneFieldProps {
  /** `User.timezone`; null follows the server zone. */
  value: string | null
  serverZone: string
  /** `timeZoneOptions()` from the server, so the list matches what the action accepts. */
  options: string[]
}

const noSubscribe = () => () => {}

/** The browser's zone under its canonical name, when the settings can store it. */
function useBrowserZone(options: string[]): string | null {
  const raw = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null
  )
  if (!raw) return null
  const zone = options.includes(raw) ? raw : normalizeTimeZone(raw)
  return zone && options.includes(zone) ? zone : null
}

/**
 * The member's time zone for Rewind (Rewind 7.7). While nothing is saved and
 * the browser's zone differs from the server's, the field suggests the
 * browser's zone and shows "Unsaved changes" until Save.
 */
export function TimezoneField({ value, serverZone, options }: TimezoneFieldProps) {
  const [saved, setSaved] = useState<string>(value ?? SERVER)
  const [choice, setChoice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { showError, showSuccess } = useToast()
  const browserZone = useBrowserZone(options)

  const suggested = saved === SERVER && browserZone && browserZone !== serverZone ? browserZone : saved
  const selected = choice ?? suggested
  const dirty = selected !== saved

  const items = useMemo(
    () => [
      { value: SERVER, label: `Server time zone (${serverZone})` },
      ...options.map((zone) => ({ value: zone, label: zone })),
    ],
    [options, serverZone]
  )

  const save = () => {
    startTransition(async () => {
      const result = await setUserTimezone({ timeZone: selected === SERVER ? null : selected })
      if (!result.success) {
        showError(result.error)
        return
      }
      const stored = result.data.timeZone ?? SERVER
      setSaved(stored)
      setChoice(stored)
      showSuccess("Time zone saved")
    })
  }

  return (
    <div className="flex flex-col gap-4" data-testid="account-timezone" data-dirty={dirty || undefined}>
      <Field>
        <FieldLabel nativeLabel={false} render={<div />}>
          Time zone
        </FieldLabel>
        <Select items={items} value={selected} onValueChange={(next) => next && setChoice(next)}>
          <SelectTrigger aria-label="Time zone" data-testid="account-timezone-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                label={item.label}
                data-testid={`account-timezone-option-${item.value}`}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Used for times in your Rewind. A change applies the next time your Rewind is made.
        </FieldDescription>
      </Field>
      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <span className="text-label text-muted-foreground" data-testid="account-timezone-unsaved">
            Unsaved changes
          </span>
        )}
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty}
          loading={isPending}
          loadingLabel="Saving"
          data-testid="account-timezone-save"
        >
          Save
        </Button>
      </div>
    </div>
  )
}
