"use client"

import { useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { FieldDescription } from "@/components/ui/field"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import type { SavedSecret } from "@/lib/security/saved-secret"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

export type SecretInputState = "saved" | "empty" | "entered" | "reenter-required"

/**
 * The state a secret field is in (ui-design-system 5.5):
 *
 * | State | When |
 * |---|---|
 * | `entered` | a value is typed |
 * | `empty` | nothing typed and nothing saved |
 * | `reenter-required` | nothing typed, and the section's address no longer matches `saved.origin` (SEC-31), or the stored value is unreadable with the current encryption key (P11.1) |
 * | `saved` | nothing typed, a secret is saved and may be reused |
 *
 * `currentOrigin` left out means the field has no address to follow, so a
 * saved secret stays `saved`; so does one with a fixed destination (`origin: null`).
 *
 * @internal
 */
export function secretInputState(value: string, saved: SavedSecret | null | undefined, currentOrigin?: string | null): SecretInputState {
  if (value) return "entered"
  if (!saved) return "empty"
  if (saved.unreadable) return "reenter-required"
  if (saved.origin && currentOrigin !== undefined && currentOrigin !== saved.origin) return "reenter-required"
  return "saved"
}

/** "localhost:5055" from "http://localhost:5055". */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

type InputProps = ComponentProps<typeof Input>

interface SecretInputProps extends Omit<InputProps, "type" | "value" | "defaultValue" | "onValueChange" | "leading" | "trailing"> {
  /** The typed value only; a saved secret is never a value of this field. */
  value: string
  onValueChange: (value: string) => void
  /** What the server says about the stored secret, from `describeSecret`. */
  saved?: SavedSecret | null
  /** The live origin of the section's URL field (`safeOrigin`); leave out for a fixed destination. */
  currentOrigin?: string | null
  /** "key" or "token", for the hints. */
  noun?: string
  /** Also prefixes the `-saved` marker and the `-reenter` hint. */
  "data-testid"?: string
}

/**
 * A token or API key field (ui-design-system 5.5, SEC-31). It never holds a
 * stored secret: the saved state is a masked placeholder ending in
 * `saved.last4` with a lock and "Saved", and a blank submit keeps the stored
 * secret. Show and Hide act only on a typed value. When the section's address
 * moves to another origin, the field turns empty and required with "Re-enter
 * to use with the new address"; the section's `blockedReason`
 * (`needsSecretReentry`) disables Test and Save, and the server refuses too.
 *
 * There is deliberately no way to reveal a stored secret: sending it to the
 * browser would undo what SEC-31 protects. Place it inside a `FormField`,
 * which labels it and links its hints through `aria-describedby`.
 */
export function SecretInput({
  value,
  onValueChange,
  saved,
  currentOrigin,
  noun = "key",
  required,
  placeholder,
  className,
  "data-testid": testId,
  ...props
}: SecretInputProps) {
  const [shown, setShown] = useState(false)
  const state = secretInputState(value, saved, currentOrigin)
  const visible = state === "entered" && shown

  const placeholderFor: Record<SecretInputState, string | undefined> = {
    saved: saved ? `${"•".repeat(12)}${saved.last4}` : undefined,
    "reenter-required": "Required",
    empty: placeholder,
    entered: placeholder,
  }

  return (
    <>
      <Input
        {...props}
        type={visible ? "text" : "password"}
        value={value}
        onValueChange={(next) => onValueChange(next)}
        placeholder={placeholderFor[state]}
        required={state === "reenter-required" || (required && state !== "saved")}
        autoComplete="off"
        spellCheck={false}
        data-state={state}
        data-testid={testId}
        className={cn("font-mono", state === "saved" && "placeholder:text-foreground", className)}
        // Always a trailing slot, so the input keeps its node (and focus) as the state changes
        trailing={
          <span className="flex items-center empty:hidden">
            {state === "saved" && (
              <span className="flex items-center gap-1 text-caption font-medium text-success" data-testid={testId && `${testId}-saved`}>
                <Icon icon={icons.savedSecret} size={12} />
                Saved
              </span>
            )}
            {state === "entered" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-mr-2 h-7 px-2"
                aria-pressed={visible}
                onClick={() => setShown((now) => !now)}
                disabled={props.disabled}
                data-testid={testId && `${testId}-reveal`}
              >
                {visible ? "Hide" : "Show"}
              </Button>
            )}
          </span>
        }
      />
      {state === "saved" && saved && (
        <FieldDescription className="sr-only">
          {saved.last4 ? `A ${noun} ending in ${saved.last4} is saved.` : `A ${noun} is saved.`} Leave this blank to keep it.
        </FieldDescription>
      )}
      {state === "reenter-required" && saved?.unreadable && (
        <FieldDescription className="flex items-start gap-1.5" data-testid={testId && `${testId}-unreadable`}>
          <Icon icon={icons.reenterSecret} size={12} className="mt-1" />
          <span>The stored {noun} can&apos;t be read with the current encryption key. Enter it again.</span>
        </FieldDescription>
      )}
      {state === "reenter-required" && !saved?.unreadable && saved?.origin && (
        <FieldDescription className="flex items-start gap-1.5" data-testid={testId && `${testId}-reenter`}>
          <Icon icon={icons.reenterSecret} size={12} className="mt-1" />
          <span>
            Re-enter to use with the new address. The saved {noun} only goes to <span className="font-mono">{hostOf(saved.origin)}</span>.
          </span>
        </FieldDescription>
      )}
    </>
  )
}
