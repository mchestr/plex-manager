"use client"

import type { ReactNode } from "react"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type ModalMaxWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl"

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Max width of the dialog card. Defaults to "md". */
  maxWidth?: ModalMaxWidth
  /** ARIA labelledby target (id of the title element inside `children`). */
  labelledBy?: string
  /** ARIA describedby target (id of the description element inside `children`). */
  describedBy?: string
  /** Extra classes for the dialog card. */
  className?: string
  /** Aligns the card to the top instead of centring it, for tall content like previews. */
  scrollable?: boolean
  /** `data-testid` for the dialog element. */
  testId?: string
}

const maxWidthClasses: Record<ModalMaxWidth, string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-md",
  lg: "md:max-w-lg",
  xl: "md:max-w-xl",
  "2xl": "md:max-w-2xl",
  "3xl": "md:max-w-3xl",
  "4xl": "md:max-w-4xl",
}

/**
 * @deprecated Use Dialog from components/ui/dialog (ui-design-system 9.4).
 * This adapter renders Dialog with today's props until its importers move
 * (P10.11 deletes it); it gains no variants. The children bring their own
 * padding, title and close button.
 */
export function ModalShell({
  isOpen,
  onClose,
  children,
  maxWidth = "md",
  labelledBy,
  describedBy,
  className,
  scrollable = false,
  testId,
}: ModalShellProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        align={scrollable ? "top" : "center"}
        data-testid={testId}
        {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
        className={cn("gap-0 p-0 pb-0 md:pb-0", maxWidthClasses[maxWidth], className)}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}
