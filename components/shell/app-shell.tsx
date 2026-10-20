import Link from "next/link"
import type { ReactNode } from "react"

import { AccountMenu } from "@/components/shell/account-menu"
import { MemberNav } from "@/components/shell/member-nav"
import { MobileNav } from "@/components/shell/mobile-nav"
import { ShellChrome } from "@/components/shell/shell-chrome"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/ui/wordmark"
import type { MemberNavItem } from "@/lib/member/nav"
import type { ShellUser } from "@/lib/member/shell"

export interface AppShellProps {
  serverName: string
  user: ShellUser
  nav: MemberNavItem[]
  /** The one page-wide Alert under the top bar (ui-design-system 6.1). */
  notice?: ReactNode
  children: ReactNode
}

/**
 * The member shell (ui-design-system 6.1, UI-30): a sticky top bar with the
 * Wordmark, the nav, an Admin link for admins and the account menu; below
 * `md` a 56px bar whose menu button opens a Sheet with the same links. Under
 * it sits the notice slot, then the page's one `<main id="main">`.
 *
 * Rewind pages draw their own chrome, so the bar and notice step aside there
 * (`isImmersiveRoute`).
 */
export function AppShell({ serverName, user, nav, notice, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="app-shell">
      <ShellChrome>
        <header
          className="sticky top-0 z-(--z-sticky) h-14 border-b border-border bg-background md:h-15"
          data-testid="app-top-bar"
        >
          <div className="mx-auto flex h-full max-w-6xl items-center gap-2 px-4 sm:px-6 md:gap-6">
            <Link href="/" className="flex min-w-0 items-center rounded-sm" data-testid="app-wordmark">
              <Wordmark serverName={serverName} />
            </Link>
            <MemberNav items={nav} />
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {user.isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex"
                  nativeButton={false}
                  render={<Link href="/admin" />}
                  data-testid="app-admin-link"
                >
                  Admin
                </Button>
              )}
              <AccountMenu user={user} />
              <MobileNav items={nav} isAdmin={user.isAdmin} />
            </div>
          </div>
        </header>
        {notice}
      </ShellChrome>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
  )
}
