"use client"

import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-slate-800/95 border-slate-600/50 text-slate-100 shadow-lg backdrop-blur-sm",
          success: "bg-green-900/90 border-green-500/50 text-green-100",
          error: "bg-red-900/90 border-red-500/50 text-red-100",
          info: "bg-slate-800/90 border-slate-600/50 text-slate-100",
          warning: "bg-amber-900/90 border-amber-500/50 text-amber-100",
          description: "text-slate-400",
          actionButton:
            "bg-primary text-primary-foreground",
          cancelButton:
            "bg-muted text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

// Backward-compatible hook matching the old useToast API
function useToast() {
  const showToast = (message: string, type: "success" | "error" | "info" = "info", duration?: number) => {
    const options = duration ? { duration } : undefined
    switch (type) {
      case "success":
        toast.success(message, options)
        break
      case "error":
        toast.error(message, { duration: duration ?? 5000 })
        break
      case "info":
      default:
        toast.info(message, options)
        break
    }
  }

  const showSuccess = (message: string, duration?: number) => {
    toast.success(message, duration ? { duration } : undefined)
  }

  const showError = (message: string, duration?: number) => {
    toast.error(message, { duration: duration ?? 5000 })
  }

  const showInfo = (message: string, duration?: number) => {
    toast.info(message, duration ? { duration } : undefined)
  }

  return {
    showToast,
    showSuccess,
    showError,
    showInfo,
    // Also expose the raw toast for advanced usage
    toast,
  }
}

// Legacy ToastProvider for backward compatibility - just renders the Toaster
function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}

export { Toaster, useToast, ToastProvider, toast }
