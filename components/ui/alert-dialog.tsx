"use client"

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { DialogContent, DialogHeader } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * A dialog that asks for a decision (`role="alertdialog"`), on Base UI
 * AlertDialog. A backdrop click never closes it; Escape and Cancel do. It
 * uses the Dialog panel, without the Close button, because Cancel is one.
 */
export function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root {...props} />
}

export function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

export function AlertDialogContent(props: Omit<ComponentProps<typeof DialogContent>, "showCloseButton">) {
  return <DialogContent data-slot="alert-dialog-content" showCloseButton={false} {...props} />
}

/** The ghost Cancel button, which closes the dialog. */
export function AlertDialogCancel({
  children = "Cancel",
  ...props
}: Omit<AlertDialogPrimitive.Close.Props, "render" | "className"> & { className?: string }) {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-cancel" render={<Button variant="ghost" />} {...props}>
      {children}
    </AlertDialogPrimitive.Close>
  )
}

/** The confirm button: `destructive-solid` by default, as AlertDialog confirms are. */
export function AlertDialogAction({ variant = "destructive-solid", ...props }: ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" variant={variant} {...props} />
}

/** The Dialog header, without the room Dialog keeps for its Close button. */
export function AlertDialogHeader({ className, ...props }: ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn("pr-0", className)} {...props} />
}

export {
  DialogDescription as AlertDialogDescription,
  DialogFooter as AlertDialogFooter,
  DialogTitle as AlertDialogTitle,
} from "@/components/ui/dialog"
