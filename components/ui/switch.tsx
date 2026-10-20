import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import type { Ref } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface SwitchProps {
  /** Whether the switch is in the on position */
  checked: boolean
  /** Called with the next checked value when the user toggles the switch */
  onCheckedChange: (checked: boolean) => void
  /** Disables interaction */
  disabled?: boolean
  /** Shows a spinner in the thumb and disables interaction, keeping the state colour */
  loading?: boolean
  /**
   * The switch's stable accessible name ("Watchlist Sync"). Leave it out when a
   * visible `<label htmlFor={id}>` or `FieldLabel` names the switch.
   */
  label?: string
  id?: string
  name?: string
  /** Passthrough test id for stable selectors */
  "data-testid"?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * The toggle switch, on Base UI Switch rendered as a native button
 * (ui-design-system 5.4): 36x20, off `secondary` with a muted thumb, on
 * `primary-indicator` with its foreground thumb sliding 16px over 180ms.
 * The state lives in `aria-checked`, never in the name, and touch gets a
 * 44px hit area. Presentational: wire `onCheckedChange` to your own action.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  loading = false,
  label,
  className,
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled || loading}
      nativeButton
      render={<button type="button" />}
      aria-label={label}
      aria-busy={loading || undefined}
      className={cn(
        "group/switch relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-input bg-secondary px-px",
        "transition-colors duration-(--duration-base) ease-(--ease-out-quiet)",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3",
        "data-checked:border-primary-indicator data-checked:bg-primary-indicator data-disabled:cursor-not-allowed",
        // A busy switch keeps its state colour; only a plain disabled one turns muted.
        disabled && !loading && "border-border bg-muted data-checked:border-border data-checked:bg-muted",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "flex size-4 items-center justify-center rounded-full bg-muted-foreground text-muted-foreground",
          "transition-transform duration-(--duration-base) ease-(--ease-out-quiet)",
          "data-checked:translate-x-4 data-checked:bg-primary-indicator-foreground",
          disabled && !loading && "data-checked:bg-muted-foreground"
        )}
      >
        {loading && <Spinner size={12} className={cn(checked ? "text-primary-indicator" : "text-background")} />}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}
