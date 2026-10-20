"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { popupSurface } from "@/components/ui/dropdown-menu"
import { usePopupLayer, usePortalContainer } from "@/components/ui/portal-container"
import { cn } from "@/lib/utils"

/**
 * A tooltip on Base UI Tooltip, only for icon-only buttons and truncated text
 * (ui-design-system 5.4). It opens on hover or focus after 400ms, stays open
 * while hovered, and closes on Escape (WCAG 1.4.13). The trigger still needs
 * its own accessible name; the tooltip only repeats it.
 */
export function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />
}

export function TooltipTrigger({ delay = 400, ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" delay={delay} {...props} />
}

type ContentProps = Omit<TooltipPrimitive.Popup.Props, "className"> &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "side" | "sideOffset"> & { className?: string }

export function TooltipContent({ align = "center", side = "top", sideOffset = 6, className, ...props }: ContentProps) {
  const { container, popupProps } = usePortalContainer()
  const layer = usePopupLayer()
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner className={layer} align={align} side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          {...popupProps}
          className={cn(popupSurface, "max-w-xs rounded-md px-2 py-1 text-caption", popupProps?.className, className)}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}
