"use client"

import { useEffect, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { errorCopy } from "@/lib/ui/error-copy"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("error-boundary")

interface ErrorStateProps {
  error?: Error & { digest?: string }
  reset?: () => void
  title?: string
  /** Fixed copy from the caller. The error's own message is never shown (SEC-20). */
  message?: string
  /** A link beside Try again, such as "Back to users". */
  secondaryAction?: ReactNode
  className?: string
}

/**
 * The in-card error (ui-design-system 5.5, UI-19): the title and description
 * from `errorCopy()` by digest, the digest in mono, and Try again. It never
 * renders `error.message` (SEC-20).
 */
export function ErrorState({ error, reset, title, message, secondaryAction, className }: ErrorStateProps) {
  useEffect(() => {
    if (error) {
      logger.error("Route Error", error, { digest: error.digest })
    }
  }, [error])

  const copy = errorCopy(error?.digest, { audience: "member" })

  return (
    <Card
      role="alert"
      className={cn("mx-auto w-full max-w-md items-center gap-3 p-6 text-center", className)}
      data-testid="error-state"
    >
      <span className="flex size-10 items-center justify-center rounded-lg border border-destructive/30 bg-destructive-subtle text-destructive">
        <Icon icon={icons.warning} size={20} />
      </span>
      <h2 className="text-h3 text-foreground">{title ?? copy.title}</h2>
      <p className="text-ui text-muted-foreground">{message || copy.description}</p>
      {error?.digest && (
        <p className="text-caption text-muted-foreground" data-testid="error-state-digest">
          Reference <span className="font-mono">{error.digest}</span>
        </p>
      )}
      {(reset || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {reset && (
            <Button onClick={reset} data-testid="error-state-retry">
              Try again
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </Card>
  )
}
