import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "@/lib/utils"

type GroupName = { "aria-label": string; "aria-labelledby"?: never } | { "aria-labelledby": string; "aria-label"?: never }

type SegmentedControlProps = Omit<RadioGroupPrimitive.Props<string>, "className" | "aria-label" | "aria-labelledby"> &
  GroupName & { className?: string }

/**
 * One choice from a few, on Base UI RadioGroup (ui-design-system 5.4): a
 * `radiogroup` with 28px segments, the selected one the `foreground` inverse
 * (solid ink in Rewind). The arrows move the selection and Tab leaves the
 * group. It must be named with `aria-label` or `aria-labelledby`.
 *
 * ```tsx
 * <SegmentedControl aria-label="Format" defaultValue="story">
 *   <Segment value="story">Story</Segment>
 *   <Segment value="square">Square</Segment>
 * </SegmentedControl>
 * ```
 */
export function SegmentedControl({ className, ...props }: SegmentedControlProps) {
  return (
    <RadioGroupPrimitive
      data-slot="segmented-control"
      className={cn("inline-flex w-fit items-center gap-0.5 rounded-md border border-border p-0.5", className)}
      {...props}
    />
  )
}

interface SegmentProps extends Omit<RadioPrimitive.Root.Props<string>, "className"> {
  className?: string
}

export function Segment({ className, ...props }: SegmentProps) {
  return (
    <RadioPrimitive.Root
      data-slot="segment"
      className={cn(
        "relative inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-3 text-label font-medium whitespace-nowrap text-muted-foreground select-none",
        "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
        "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2",
        "not-data-checked:hover:text-foreground",
        "data-checked:bg-foreground data-checked:text-background",
        "data-disabled:cursor-not-allowed data-disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
}
