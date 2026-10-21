import { inkProps } from "@/lib/design/tokens"
import { cn } from "@/lib/utils"

/**
 * A share link that is malformed, unknown, revoked, rotated or expired, on
 * paper (design 6.6, BP-35). The copy is the same for all of them, so it
 * reveals nothing about which one it was.
 */
export function ShareNotFound() {
  const paper = inkProps("paper")
  return (
    <main
      id="main"
      tabIndex={-1}
      {...paper}
      className={cn(paper.className, "flex min-h-dvh items-center justify-center bg-background px-4 text-foreground outline-none")}
    >
      <div className="flex max-w-md flex-col gap-3">
        <p className="font-display text-label">Rewind</p>
        <h1 data-testid="rewind-share-not-found" className="font-display text-h1">
          This Rewind is no longer shared
        </h1>
      </div>
    </main>
  )
}
