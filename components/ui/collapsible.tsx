"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

type WithClassName<P> = Omit<P, "className"> & { className?: string }

/**
 * A disclosure on Base UI Collapsible: a trigger button with `aria-expanded`
 * that shows and hides one panel. Enter and Space toggle it.
 *
 * ```tsx
 * <Collapsible>
 *   <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>Show each</CollapsibleTrigger>
 *   <CollapsiblePanel>...</CollapsiblePanel>
 * </Collapsible>
 * ```
 *
 * The root and the panel render a `div`. Inside a `table`, render the root as
 * the header cell (`render={<th />}`) and show or hide the rows by state, with
 * no panel: a `div` cannot be a child of `tbody` (DataTable group rows).
 */
export function Collapsible({ className, ...props }: WithClassName<CollapsiblePrimitive.Root.Props>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" className={className} {...props} />
}

/** The button. Style it with `className`, or render a `Button` through `render`. */
export function CollapsibleTrigger({ className, ...props }: WithClassName<CollapsiblePrimitive.Trigger.Props>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn("data-disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

/**
 * The panel. Closed, it leaves the DOM (or keeps `hidden="until-found"` with
 * `hiddenUntilFound`); its height eases open and shut, which reduced motion cuts.
 */
export function CollapsiblePanel({ className, ...props }: WithClassName<CollapsiblePrimitive.Panel.Props>) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-base) ease-(--ease-out-quiet)",
        "data-starting-style:h-0 data-ending-style:h-0 [&[hidden]:not([hidden=until-found])]:hidden",
        className
      )}
      {...props}
    />
  )
}
