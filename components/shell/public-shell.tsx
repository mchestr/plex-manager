import type { ReactNode } from "react"

import { PublicSignOut } from "@/components/shell/public-sign-out"
import { Wordmark } from "@/components/ui/wordmark"
import { cn } from "@/lib/utils"

interface PublicShellProps {
  serverName: string
  /** `narrow` is a 440px column, `wide` 560px. */
  width?: "narrow" | "wide"
  /** The signed-in member: shows their name and a Sign out escape. */
  account?: { name: string }
  children: ReactNode
  "data-testid"?: string
}

/**
 * The shell of every public page (ui-design-system 6.6): the Wordmark
 * top-left on `bg-background`, then a centred column inside the page's one
 * `<main id="main">`. With `account` the bar also carries the member's name
 * and Sign out, so a gated member can always leave (UI-37); onboarding's
 * minimal variant uses the same prop (P10.23).
 */
export function PublicShell({ serverName, width = "narrow", account, children, ...props }: PublicShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground" data-testid="public-shell">
      <header className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Wordmark serverName={serverName} className="mr-auto" />
        {account && (
          <>
            <span className="hidden max-w-48 truncate text-ui text-muted-foreground sm:inline" data-testid="public-shell-account">
              {account.name}
            </span>
            <PublicSignOut />
          </>
        )}
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center px-4 py-8 outline-none sm:px-6"
        data-testid={props["data-testid"]}
      >
        <div className={cn("flex w-full flex-col items-center", width === "wide" ? "max-w-[560px]" : "max-w-[440px]")}>
          {children}
        </div>
      </main>
    </div>
  )
}
