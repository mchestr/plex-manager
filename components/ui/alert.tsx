import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

type AlertTone = "info" | "success" | "warning" | "destructive"

interface AlertProps extends Omit<ComponentProps<"div">, "title"> {
  /** Tone of the alert; also picks the default icon and the role. */
  tone?: AlertTone
  /** A short heading in semibold above the message. */
  title?: ReactNode
  /** Replaces the tone's icon; `null` renders none. */
  icon?: ReactNode
  /** Actions on the trailing edge; they wrap below the message on narrow screens. */
  action?: ReactNode
}

const toneClasses: Record<AlertTone, string> = {
  info: "border-info/30 bg-info/8",
  success: "border-success/30 bg-success/8",
  warning: "border-warning/30 bg-warning/8",
  destructive: "border-destructive/30 bg-destructive/8",
}

const toneIcons: Record<AlertTone, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-info" },
  success: { icon: CircleCheck, className: "text-success" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  destructive: { icon: CircleX, className: "text-destructive" },
}

/**
 * A tinted callout for a status message (ui-design-system 5.4).
 *
 * `warning` and `destructive` are assertive (`role="alert"`); `info` and
 * `success` are polite (`role="status"`). Pass `role` to override.
 */
export function Alert({ tone = "info", title, icon, action, className, children, role, ...props }: AlertProps) {
  const toneIcon = toneIcons[tone]
  return (
    <div
      role={role ?? (tone === "warning" || tone === "destructive" ? "alert" : "status")}
      data-slot="alert"
      data-tone={tone}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border p-3 text-ui text-foreground",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {icon === undefined ? <Icon icon={toneIcon.icon} className={cn("mt-0.5", toneIcon.className)} /> : icon}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="flex basis-full items-center gap-2 sm:basis-auto sm:self-center">{action}</div>}
    </div>
  )
}
