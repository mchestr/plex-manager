"use client"

import { ReactNode, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
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
  /**
   * When true, the overlay scrolls the whole page and the card aligns to top
   * (for tall content like previews). When false (default), the card is
   * vertically centered.
   */
  scrollable?: boolean
}

const maxWidthClasses: Record<ModalMaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
}

/**
 * Shared modal chrome: full-screen overlay + blurred backdrop + centered dialog
 * card, with focus trap, ESC-to-close, body-scroll lock, focus restoration, and
 * portal rendering to `document.body`.
 *
 * Previously each content modal (confirm, announcement form, invite create,
 * prompt-template preview) hand-rolled the overlay/backdrop/dialog markup with
 * drifting z-index and backdrop opacity, and most lacked the focus-trap/ESC
 * behavior that ConfirmModal had. Rendering their content inside <ModalShell>
 * standardizes the chrome and gives them all the same accessibility wiring.
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
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<Element | null>(null)

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Focus management + focus trap
  useEffect(() => {
    if (!isOpen) return

    previousActiveElement.current = document.activeElement

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstFocusable = focusableElements?.[0]
    const lastFocusable = focusableElements?.[focusableElements.length - 1]
    firstFocusable?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable?.focus()
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable?.focus()
        }
      }
    }

    document.addEventListener("keydown", handleTab)
    return () => {
      document.removeEventListener("keydown", handleTab)
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen])

  if (!isOpen || typeof window === "undefined") return null

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex justify-center p-4 overflow-y-auto",
        scrollable ? "items-start" : "items-center"
      )}
      onClick={onClose}
      role="presentation"
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div className={cn("relative w-full my-auto", maxWidthClasses[maxWidth])}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className={cn(
            "relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
