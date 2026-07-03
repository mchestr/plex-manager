import { HTMLAttributes, ReactNode, forwardRef } from "react"

import { cn } from "@/lib/utils"

export type AlertTone = "info" | "warning" | "danger" | "success"

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Visual tone of the alert; also drives the default icon. */
  tone?: AlertTone
  /** Optional heading rendered above the message. */
  title?: ReactNode
  /**
   * Custom leading icon. When omitted a tone-appropriate default is shown; pass
   * `null` to render no icon at all.
   */
  icon?: ReactNode
  /** Optional action slot (e.g. a link/button) rendered on the trailing edge. */
  action?: ReactNode
}

const toneClasses: Record<AlertTone, string> = {
  info: "bg-cyan-500/10 border-cyan-500/40 text-cyan-100",
  warning: "bg-amber-500/10 border-amber-500/40 text-amber-100",
  danger: "bg-red-500/10 border-red-500/40 text-red-100",
  success: "bg-green-500/10 border-green-500/40 text-green-100",
}

const iconColor: Record<AlertTone, string> = {
  info: "text-cyan-300",
  warning: "text-amber-300",
  danger: "text-red-300",
  success: "text-green-300",
}

/**
 * Path drawn inside the default tone icon. `info`/`success` share the
 * information/check-style glyph; `warning`/`danger` share the alert-triangle.
 */
const iconPath: Record<AlertTone, string> = {
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  warning:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  danger:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
}

function DefaultIcon({ tone }: { tone: AlertTone }) {
  return (
    <svg
      className={cn("h-5 w-5 shrink-0", iconColor[tone])}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={iconPath[tone]}
      />
    </svg>
  )
}

/**
 * Reusable inline alert/banner primitive for the dark-slate theme.
 *
 * Standardizes the tinted-panel callout used for status messages (past-due
 * warnings, pending-invite notices, etc.) so those surfaces do not hand-roll
 * their own bordered boxes.
 *
 * ## Accessibility
 *
 * `warning` and `danger` alerts are assertive and get `role="alert"` so screen
 * readers announce them immediately; `info` and `success` use `role="status"`
 * (polite). Pass an explicit `role` to override.
 *
 * Presentational only — the optional `action` slot lets consumers drop in their
 * own link/button (e.g. "Manage payment").
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    { tone = "info", title, icon, action, className, children, role, ...props },
    ref
  ) => {
    const resolvedRole =
      role ?? (tone === "warning" || tone === "danger" ? "alert" : "status")
    const showDefaultIcon = icon === undefined
    const leadingIcon = showDefaultIcon ? <DefaultIcon tone={tone} /> : icon

    return (
      <div
        ref={ref}
        role={resolvedRole}
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
          toneClasses[tone],
          className
        )}
        {...props}
      >
        {leadingIcon}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && "mt-1")}>{children}</div>}
        </div>
        {action && <div className="shrink-0 self-center">{action}</div>}
      </div>
    )
  }
)

Alert.displayName = "Alert"
