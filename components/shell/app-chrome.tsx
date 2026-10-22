import Link from "next/link"

import { AccountMenu } from "@/components/shell/account-menu"
import { AppNotice } from "@/components/shell/app-notice"
import { MemberNav } from "@/components/shell/member-nav"
import { MobileNav } from "@/components/shell/mobile-nav"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/ui/wordmark"
import type { MemberNavItem } from "@/lib/member/nav"
import type { MemberNotice } from "@/lib/member/notice-rules"
import type { ShellUser } from "@/lib/member/shell"

export interface AppChromeProps {
  serverName: string
  user: ShellUser
  nav: MemberNavItem[]
  /** The one page-wide Alert under the top bar (ui-design-system 6.1). */
  notice?: MemberNotice | null
}

/**
 * The member shell's top bar and notice (ui-design-system 6.1, UI-30): the
 * Wordmark, the nav, an Admin link for admins and the account menu; below
 * `md` a 56px bar whose menu button opens a Sheet with the same links.
 * `ShellChrome` loads it only off the immersive routes.
 */
export function AppChrome({ serverName, user, nav, notice }: AppChromeProps) {
  return (
    <>
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
      {notice && <AppNotice notice={notice} />}
    </>
  )
}
