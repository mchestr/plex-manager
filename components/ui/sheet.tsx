"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { PanelCloseButton } from "@/components/ui/dialog"
import { InModalProvider, usePortalContainer } from "@/components/ui/portal-container"
import { cn } from "@/lib/utils"

/**
 * A sheet: a Dialog panel that slides in from the right (the assistant, 420px)
 * or the bottom (filters, the More nav, Rewind's share sheet), on the same
 * Base UI Dialog parts as `dialog.tsx` (ui-design-system 5.4). Focus is
 * trapped, the page behind is inert, Escape and a backdrop click close it,
 * and focus returns to the trigger.
 *
 * Inside Rewind the layout's `PortalContainerProvider` portals it into the
 * scope and its `popupProps` print it on paper (4.4).
 */
export {
  Dialog as Sheet,
  DialogClose as SheetClose,
  DialogDescription as SheetDescription,
  DialogFooter as SheetFooter,
  DialogHeader as SheetHeader,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from "@/components/ui/dialog"

interface SheetContentProps extends Omit<DialogPrimitive.Popup.Props, "className"> {
  className?: string
  side?: "right" | "bottom"
  /**
   * A decorative 36x4px bar at the top of a bottom sheet. It only marks the
   * sheet's edge: nothing is drag-only (WCAG 2.5.7), so Close and Escape
   * still close it.
   */
  grabber?: boolean
  /** The top-right Close button; on by default, so touch screen readers can leave the sheet. */
  showCloseButton?: boolean
}

const sides = {
  right: cn(
    "inset-y-0 right-0 h-dvh w-full max-w-[420px] rounded-l-xl border-l",
    "data-starting-style:translate-x-full data-ending-style:translate-x-full"
  ),
  bottom: cn(
    "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-xl border-t pb-[max(1.5rem,env(safe-area-inset-bottom))]",
    "data-starting-style:translate-y-full data-ending-style:translate-y-full"
  ),
}

export function SheetContent({
  className,
  side = "right",
  grabber = false,
  showCloseButton = true,
  children,
  ...props
}: SheetContentProps) {
  const { container, popupProps } = usePortalContainer()
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className={cn(
          "fixed inset-0 z-(--z-overlay) bg-overlay",
          "transition-opacity duration-(--duration-slow) ease-(--ease-out-quiet) data-ending-style:opacity-0 data-starting-style:opacity-0"
        )}
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        {...popupProps}
        className={cn(
          "fixed z-(--z-modal) flex flex-col gap-4 overflow-y-auto border-border-strong bg-popover p-6 text-popover-foreground shadow-dialog outline-none",
          "transition-[opacity,translate] duration-(--duration-slow) ease-(--ease-out-quiet)",
          "data-ending-style:duration-(--duration-fast) data-ending-style:ease-(--ease-in-quiet)",
          sides[side],
          // Reduced motion: no slide, a 120ms fade (Rewind 5.6 "Sheets and toggles").
          "motion-reduce:data-starting-style:translate-none motion-reduce:data-ending-style:translate-none motion-reduce:duration-(--duration-fast) motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
          popupProps?.className,
          className
        )}
        {...props}
      >
        <InModalProvider>
          {grabber && (
            <div
              aria-hidden="true"
              data-slot="sheet-grabber"
              className="mx-auto -mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong"
            />
          )}
          {children}
          {showCloseButton && <PanelCloseButton />}
        </InModalProvider>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}
