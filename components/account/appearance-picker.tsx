"use client"

import { useState, useTransition } from "react"

import { setAppearance } from "@/actions/appearance"
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { useToast } from "@/components/ui/toast"
import { useAppearance } from "@/lib/appearance-context"
import type { Theme } from "@/lib/design/theme"

const CHOICES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
]

/** The current choice, saved through `setAppearance`; reverts and toasts when the save fails. */
function useThemeChoice() {
  const { theme } = useAppearance()
  const [choice, setChoice] = useState<Theme>(theme)
  const [isPending, startTransition] = useTransition()
  const { showError } = useToast()

  const choose = (value: unknown) => {
    const next: Theme = value === "light" ? "light" : "dark"
    if (next === choice) return
    const previous = choice
    setChoice(next)
    startTransition(async () => {
      const result = await setAppearance(next)
      if (!result.success) {
        setChoice(previous)
        showError(result.error)
        return
      }
    })
  }

  return { choice, choose, isPending }
}

interface AppearancePickerProps {
  /** `inline` for `/account`; `menu` inside a DropdownMenuContent (the account and admin menus). */
  variant?: "inline" | "menu"
  /** Prefix of the test ids: `<testId>` on the group, `<testId>-dark` and `<testId>-light` on the choices. */
  testId?: string
}

/**
 * The Appearance choice, Dark or Light (P10.10, ui-design-system 4.1): one
 * component for `/account`, the account menu and the admin menu. It renders
 * nothing while `Config.lightThemeEnabled` is off. There is no "System"
 * choice yet: it needs a pre-paint script carrying the CSP nonce (P11.20).
 */
export function AppearancePicker({ variant = "inline", testId = "appearance" }: AppearancePickerProps) {
  const { enabled } = useAppearance()
  const { choice, choose, isPending } = useThemeChoice()
  if (!enabled) return null

  if (variant === "menu") {
    return (
      <DropdownMenuGroup>
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={choose} disabled={isPending} data-testid={testId}>
          {CHOICES.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick={false} data-testid={`${testId}-${value}`}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span id={`${testId}-label`} className="text-ui font-medium text-foreground">
          Theme
        </span>
        <p className="text-label text-muted-foreground">Rewind keeps its own colours in either theme.</p>
      </div>
      <SegmentedControl
        aria-labelledby={`${testId}-label`}
        value={choice}
        onValueChange={choose}
        disabled={isPending}
        aria-busy={isPending || undefined}
        data-testid={testId}
      >
        {CHOICES.map(({ value, label }) => (
          <Segment key={value} value={value} data-testid={`${testId}-${value}`}>
            {label}
          </Segment>
        ))}
      </SegmentedControl>
    </div>
  )
}
