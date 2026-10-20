"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, ChevronsUpDown } from "lucide-react"

import { usePopupLayer, usePortalContainer } from "@/components/ui/portal-container"
import { cn } from "@/lib/utils"

type WithClassName<P> = Omit<P, "className"> & { className?: string }

/**
 * A select on Base UI Select (ui-design-system 5.4, UI-14): a combobox
 * trigger, a portalled listbox, typeahead, and a check on the selected item.
 *
 * ```tsx
 * <Select items={items} value={value} onValueChange={setValue}>
 *   <SelectTrigger aria-label="Role"><SelectValue placeholder="Any role" /></SelectTrigger>
 *   <SelectContent>
 *     {items.map((item) => <SelectItem key={item.value} value={item.value} label={item.label}>{item.label}</SelectItem>)}
 *   </SelectContent>
 * </Select>
 * ```
 */
export const Select = SelectPrimitive.Root

const triggerVariants = cva(
  [
    "flex w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-background text-left whitespace-nowrap text-foreground select-none",
    "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
    "focus-visible:border-ring focus-visible:-outline-offset-2",
    "data-popup-open:border-ring data-invalid:border-destructive aria-invalid:border-destructive",
    "data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:bg-muted data-disabled:text-muted-foreground",
  ],
  {
    variants: {
      size: {
        /** The input-height trigger, 40px below `md` like Input. */
        default: "h-10 border-input px-3 text-ui md:h-9",
        /** The 32px filter-bar trigger. */
        sm: "h-8 border-border-strong px-2.5 text-label",
        lg: "h-11 border-input px-3 text-body",
      },
    },
    defaultVariants: { size: "default" },
  }
)

interface SelectTriggerProps extends WithClassName<SelectPrimitive.Trigger.Props>, VariantProps<typeof triggerVariants> {}

export function SelectTrigger({ size, className, children, ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger data-slot="select-trigger" className={cn(triggerVariants({ size }), className)} {...props}>
      {children}
      <SelectPrimitive.Icon className="flex text-muted-foreground">
        <ChevronsUpDown aria-hidden="true" size={16} strokeWidth={1.75} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectValue({ className, ...props }: WithClassName<SelectPrimitive.Value.Props>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("truncate data-placeholder:text-muted-foreground", className)}
      {...props}
    />
  )
}

interface SelectContentProps extends WithClassName<SelectPrimitive.Popup.Props> {
  side?: SelectPrimitive.Positioner.Props["side"]
  align?: SelectPrimitive.Positioner.Props["align"]
}

/**
 * The listbox popup: portalled into `usePortalContainer()`, stacked above a
 * dialog when inside one, and carrying the container's `popupProps`.
 */
export function SelectContent({ side = "bottom", align = "start", className, children, ...props }: SelectContentProps) {
  const { container, popupProps } = usePortalContainer()
  const layer = usePopupLayer()
  const { className: popupClassName, ...popupAttributes } = popupProps

  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={4}
        alignItemWithTrigger={false}
        className={cn("outline-none", layer)}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto rounded-lg border border-border-strong bg-popover p-1 text-popover-foreground shadow-popover outline-none",
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-fast) ease-(--ease-out-quiet)",
            "data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0",
            popupClassName,
            className
          )}
          {...popupAttributes}
          {...props}
        >
          <SelectPrimitive.List data-slot="select-list">{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

/**
 * A 32px option with a trailing check when selected. Pass a string `label`
 * when the children are not plain text, so typeahead can match it.
 */
export function SelectItem({ className, children, ...props }: WithClassName<SelectPrimitive.Item.Props>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex h-8 cursor-default items-center justify-between gap-2 rounded-sm px-2 text-ui text-foreground outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:cursor-not-allowed data-disabled:text-muted-foreground",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="flex">
        <Check aria-hidden="true" size={16} strokeWidth={1.75} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export function SelectGroup({ className, ...props }: WithClassName<SelectPrimitive.Group.Props>) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("py-0.5", className)} {...props} />
}

/** A group heading inside the list, in muted 13px. */
export function SelectLabel({ className, ...props }: WithClassName<SelectPrimitive.GroupLabel.Props>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 pt-1.5 pb-1 text-label text-muted-foreground", className)}
      {...props}
    />
  )
}
