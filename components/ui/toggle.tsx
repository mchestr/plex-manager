import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"

import { cn } from "@/lib/utils"

interface ToggleProps extends Omit<TogglePrimitive.Props<string>, "className"> {
  className?: string
  /** `sm` is 32px, `default` 36px. */
  size?: "sm" | "default"
}

/**
 * A two-state button on Base UI Toggle (ui-design-system 5.4): the state is in
 * `aria-pressed`, so the label stays the same ("Show as table"). Pressed is
 * the inverse, `foreground` on `background`; in Rewind that is solid ink with
 * field text. An optional 14px icon goes before the label. Touch gets a 44px
 * hit area.
 */
export function Toggle({ size = "default", className, ...props }: ToggleProps) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-transparent px-3 text-label font-medium whitespace-nowrap text-foreground select-none",
        "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
        "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5",
        "not-data-pressed:hover:bg-accent not-data-pressed:hover:text-accent-foreground",
        "data-pressed:border-foreground data-pressed:bg-foreground data-pressed:text-background",
        "data-disabled:pointer-events-none data-disabled:border-border data-disabled:text-muted-foreground",
        size === "sm" ? "h-8" : "h-9",
        className
      )}
      {...props}
    />
  )
}
