"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CircleCheck, CircleX, Info, X, type LucideIcon } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ToastType ="success" | "error" | "info"

interface ToastOptions {
  title: ReactNode
  description?: ReactNode
  tone?: ToastType
  /** A toast with an action never auto-dismisses (WCAG 2.2.1); the action also dismisses it. */
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  showSuccess: (message: string, duration?: number) => void
  showError: (message: string, duration?: number) => void
  showInfo: (message: string, duration?: number) => void
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => string
}

/** How long success and info toasts stay, paused while hovered or focused. */
const TIMEOUT_MS = 5000

let lastId = 0

/**
 * The toast facade (ui-design-system 5.4), on Base UI Toast. Success and info
 * toasts last 5s (a legacy `duration` overrides that); errors and toasts with
 * an action stay until dismissed, and errors are announced assertively.
 */
export function useToast(): ToastApi {
  const { add, close } = ToastPrimitive.useToastManager()

  return useMemo(() => {
    const show = ({ title, description, tone = "info", action }: ToastOptions, duration?: number) => {
      const id = `toast-${++lastId}`
      const persistent = tone === "error" || action !== undefined
      return add({
        id,
        title,
        description,
        type: tone,
        timeout: persistent ? 0 : (duration ?? TIMEOUT_MS),
        actionProps: action && {
          children: action.label,
          onClick: () => {
            action.onClick()
            close(id)
          },
        },
      })
    }
    const showToast = (message: string, type: ToastType = "info", duration?: number) => {
      show({ title: message, tone: type }, duration)
    }
    return {
      showToast,
      showSuccess: (message, duration) => showToast(message, "success", duration),
      showError: (message) => showToast(message, "error"),
      showInfo: (message, duration) => showToast(message, "info", duration),
      toast: (options) => show(options),
    }
  }, [add, close])
}

const toneIcons: Record<ToastType, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: "text-success" },
  info: { icon: Info, className: "text-info" },
  error: { icon: CircleX, className: "text-destructive" },
}

const isToastType = (type: string | undefined): type is ToastType =>
  type === "success" || type === "error" || type === "info"

function ToastItem({ toast }: { toast: ToastPrimitive.Root.ToastObject }) {
  const tone: ToastType = isToastType(toast.type) ? toast.type : "info"
  const { icon: ToneIcon, className: iconClass } = toneIcons[tone]
  return (
    <ToastPrimitive.Root
      toast={toast}
      data-slot="toast"
      data-testid="toast"
      data-tone={tone}
      // Errors are assertive alerts, the rest polite status messages. Base UI's
      // own `priority: "high"` would hide the toast, Dismiss button and all,
      // behind `aria-hidden` until F6 (axe aria-hidden-focus), so it is unused.
      role={tone === "error" ? "alert" : "status"}
      aria-modal={undefined}
      className={cn(
        "w-full rounded-lg border border-border-strong bg-popover px-4 py-3.5 text-ui text-popover-foreground shadow-popover outline-none select-none",
        "transition-[opacity,translate] duration-(--duration-slow) ease-(--ease-out-quiet)",
        "data-starting-style:translate-y-2 data-starting-style:opacity-0",
        "data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast) data-ending-style:ease-(--ease-in-quiet) data-limited:hidden"
      )}
    >
      <ToastPrimitive.Content className="flex items-start gap-3">
        <ToneIcon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", iconClass)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastPrimitive.Title render={<p />} className="font-semibold" />
          <ToastPrimitive.Description render={<p />} className="text-muted-foreground" />
        </div>
        <ToastPrimitive.Action render={<Button variant="ghost" size="sm" className="-my-1.5" />} />
        <ToastPrimitive.Close
          aria-label="Dismiss notification"
          // Base UI hides Close on stacked toasts it collapses; these never collapse.
          aria-hidden={false}
          data-testid="toast-dismiss"
          render={<Button variant="ghost" size="icon-sm" className="-my-1.5 -mr-2 text-muted-foreground" />}
        >
          <X aria-hidden="true" />
        </ToastPrimitive.Close>
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()
  return toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />)
}

/**
 * Holds the toasts and renders their viewport: a "Notifications" landmark
 * above dialogs (`--z-toast`), bottom-right on desktop and full width with
 * 16px insets on mobile. F6 moves focus into it, Tab moves between toasts,
 * and Escape dismisses the focused one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider timeout={TIMEOUT_MS}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          data-testid="toast-viewport"
          render={<section />}
          className="fixed inset-x-4 bottom-4 z-(--z-toast) flex flex-col-reverse gap-2 outline-none sm:left-auto sm:w-[360px]"
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  )
}
