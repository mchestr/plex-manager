"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { popupSurface } from "@/components/ui/dropdown-menu"
import { usePopupLayer, usePortalContainer } from "@/components/ui/portal-container"
import { cn } from "@/lib/utils"

/** A non-modal panel anchored to its trigger, on Base UI Popover. */
export function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />
}

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

type ContentProps = Omit<PopoverPrimitive.Popup.Props, "className"> &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset"> & { className?: string }

export function PopoverContent({ align = "center", side = "bottom", sideOffset = 4, className, ...props }: ContentProps) {
  const { container, popupProps } = usePortalContainer()
  const layer = usePopupLayer()
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner className={layer} align={align} side={side} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          {...popupProps}
          className={cn(popupSurface, "flex w-72 max-w-(--available-width) flex-col gap-1 p-4 text-ui", popupProps?.className, className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export function PopoverTitle({ className, ...props }: Omit<PopoverPrimitive.Title.Props, "className"> & { className?: string }) {
  return <PopoverPrimitive.Title data-slot="popover-title" className={cn("font-semibold text-foreground", className)} {...props} />
}

export function PopoverDescription({
  className,
  ...props
}: Omit<PopoverPrimitive.Description.Props, "className"> & { className?: string }) {
  return <PopoverPrimitive.Description data-slot="popover-description" className={cn("text-muted-foreground", className)} {...props} />
}
