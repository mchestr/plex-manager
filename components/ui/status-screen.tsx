import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

interface StatusScreenProps {
  icon: LucideIcon
  /** "404", or an error digest, shown in muted mono. Never an error's message (SEC-20). */
  code?: string
  title: string
  description: string
  primaryAction: ReactNode
  secondaryAction?: ReactNode
  /** A stable test id for the h1, where a flow already relies on one. */
  titleTestId?: string
  /** A `data-state` on the h1, for a flow with several headlines on one test id. */
  titleState?: string
  className?: string
}

/**
 * The one full-page status design (ui-design-system 6.7, UI-19): a 40px tile
 * with a 20px icon, the code in mono, the page's h1, one sentence, and a
 * primary and optional secondary action. Pages compose it inside a shell,
 * usually PublicShell's 440px column.
 */
export function StatusScreen({
  icon,
  code,
  title,
  description,
  primaryAction,
  secondaryAction,
  titleTestId,
  titleState,
  className,
}: StatusScreenProps) {
  return (
    <div
      data-slot="status-screen"
      data-testid="status-screen"
      className={cn("flex w-full max-w-[440px] flex-col items-center gap-4 text-center", className)}
    >
      <span className="flex size-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <Icon icon={icon} size={20} />
      </span>
      {code && (
        <p className="font-mono text-label text-muted-foreground" data-testid="status-screen-code">
          {code}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-foreground" data-testid={titleTestId} data-state={titleState}>{title}</h1>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center" data-slot="status-screen-actions">
        {primaryAction}
        {secondaryAction}
      </div>
    </div>
  )
}
