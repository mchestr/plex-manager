"use client"

import { Button } from "@/components/ui/button"
import { inkProps } from "@/lib/design/tokens"
import { SHARE_UNAVAILABLE } from "@/lib/rewind/share/status-html"
import { cn } from "@/lib/utils"

/**
 * A share page whose render threw (design 6.6, RWV-05), on paper: the copy of
 * the proxy's 503 page, with Try again.
 */
export function ShareUnavailable({ onRetry }: { onRetry: () => void }) {
  const paper = inkProps("paper")
  return (
    <main
      id="main"
      tabIndex={-1}
      {...paper}
      className={cn(paper.className, "flex min-h-dvh items-center justify-center bg-background px-4 text-foreground outline-none")}
    >
      <div className="flex max-w-md flex-col gap-3" data-testid="rewind-share-unavailable">
        <h1 className="font-display text-h1">{SHARE_UNAVAILABLE.title}</h1>
        <p className="font-text text-body">{SHARE_UNAVAILABLE.body}</p>
        <Button variant="ink" size="pill" className="self-start" onClick={onRetry}>
          {SHARE_UNAVAILABLE.action}
        </Button>
      </div>
    </main>
  )
}
