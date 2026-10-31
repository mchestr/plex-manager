"use client"

import { useMemo, useState, useSyncExternalStore, useTransition } from "react"

import { setUserTimezone } from "@/actions/account"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

interface TimezoneFieldProps {
  /** `User.timezone`; null reads as the server zone until one is saved. */
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
 * The member's time zone for Rewind (Rewind 7.7). The member layout saves the
 * browser's zone the first time; while nothing is saved and the browser's zone
 * differs from the server's, the field suggests it and shows "Unsaved changes"
 * until Save.
 */
export function TimezoneField({ value, serverZone, options }: TimezoneFieldProps) {
  const [saved, setSaved] = useState<string | null>(value)
  const [choice, setChoice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { showError, showSuccess } = useToast()
  const browserZone = useBrowserZone(options)

  const current = saved ?? serverZone
  const selected = choice ?? (saved === null && browserZone ? browserZone : current)
  const dirty = selected !== current

  const items = useMemo(() => options.map((zone) => ({ value: zone, label: zone })), [options])

  const save = () => {
    startTransition(async () => {
      const result = await setUserTimezone({ timeZone: selected })
      if (!result.success) {
        showError(result.error)
        return
      }
      setSaved(result.data.timeZone)
      setChoice(result.data.timeZone)
      showSuccess("Time zone saved")
    })
  }

  return (
    <div className="flex flex-col gap-4" data-testid="account-timezone" data-dirty={dirty || undefined}>
      <Field>
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
        <FieldDescription>Changes apply to your next Rewind.</FieldDescription>
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
