"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { InModalProvider, usePortalContainer } from "@/components/ui/portal-container"
import { cn } from "@/lib/utils"

/**
 * A modal dialog on Base UI Dialog (ui-design-system 5.4): focus is trapped,
 * the page behind is inert, Escape and a backdrop click close it, and focus
 * returns to the trigger.
 *
 * A press inside the toast viewport is not an outside press, so dismissing a
 * toast never closes the dialog under it.
 */
export function Dialog({ onOpenChange, ...props }: DialogPrimitive.Root.Props) {
  return (
    <DialogPrimitive.Root
      onOpenChange={(open, details) => {
        const target = details.event.target
        if (!open && details.reason === "outside-press" && target instanceof Element && target.closest("[data-slot=toast-viewport]")) {
          details.cancel()
          return
        }
        onOpenChange?.(open, details)
      }}
      {...props}
    />
  )
}

export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

export function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

interface DialogContentProps extends Omit<DialogPrimitive.Popup.Props, "className"> {
  className?: string
  /** `form` widens the panel to 640px for dialogs that hold a form. */
  size?: "default" | "form"
  /** `top` pins a tall panel near the top of the viewport instead of centring it. */
  align?: "center" | "top"
  /** The top-right Close button; on by default, so touch screen readers can leave the dialog. */
  showCloseButton?: boolean
}

/**
 * The panel recipe shared by Dialog, AlertDialog and ConfirmDialog: a solid
 * scrim, a 480px panel (640px for forms) centred from `md`, and a bottom
 * sheet below it. Popups inside it layer above it (`InModalProvider`).
 */
export function DialogContent({
  className,
  size = "default",
  align = "center",
  showCloseButton = true,
  children,
  ...props
}: DialogContentProps) {
  const { container, popupProps } = usePortalContainer()
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className={cn(
          "fixed inset-0 z-(--z-overlay) bg-overlay",
          "transition-opacity duration-(--duration-slow) ease-(--ease-out-quiet) data-ending-style:opacity-0 data-starting-style:opacity-0"
        )}
      />
      {/* The viewport lays the panel out; it is a sheet at the bottom below md. */}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className={cn(
          "fixed inset-0 z-(--z-modal) flex items-end justify-center overflow-y-auto md:p-8",
          align === "top" ? "md:items-start" : "md:items-center"
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          {...popupProps}
          className={cn(
            "relative flex w-full flex-col gap-4 overflow-y-auto border border-border-strong bg-popover p-6 text-popover-foreground shadow-dialog outline-none",
            // Below md: a bottom sheet that clears the home indicator.
            "max-h-[85dvh] rounded-t-xl pb-[max(1.5rem,env(safe-area-inset-bottom))]",
            "md:max-h-[calc(100dvh-4rem)] md:rounded-xl md:pb-6",
            size === "form" ? "md:max-w-[640px]" : "md:max-w-[480px]",
            "transition-[opacity,scale,translate] duration-(--duration-slow) ease-(--ease-out-quiet)",
            "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-ending-style:ease-(--ease-in-quiet)",
            "max-md:data-starting-style:translate-y-8 md:data-starting-style:scale-98",
            popupProps?.className,
            className
          )}
          {...props}
        >
          <InModalProvider>
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                data-slot="dialog-close"
                render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 text-muted-foreground" />}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </InModalProvider>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />
}

/** Actions sit on the right: Cancel (ghost) first, then the confirm button. */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: Omit<DialogPrimitive.Title.Props, "className"> & { className?: string }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg/[26px] font-semibold text-foreground", className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: Omit<DialogPrimitive.Description.Props, "className"> & { className?: string }) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-ui text-muted-foreground", className)}
      {...props}
    />
  )
}
