import type { ReactNode } from "react"

import { CommandMenuProvider } from "@/components/admin/command-menu"
import { AdminNavProvider } from "@/components/shell/admin-nav-context"
import { AdminChrome } from "@/components/shell/admin-chrome"
import { AdminMobileBar } from "@/components/shell/admin-mobile-bar"
import { AdminSidebar } from "@/components/shell/admin-sidebar"
import { AdminTabBar } from "@/components/shell/admin-tab-bar"
import type { AdminShellData } from "@/lib/admin/shell"

export interface AdminShellProps extends AdminShellData {
  children: ReactNode
}

/**
 * The admin shell (ui-design-system 6.2, UI-04): the sidebar from `md`, the
 * mobile top bar and tab bar below it, the command menu (P10.16, mounted once
 * here) and the page's one `<main id="main">`. Below `md` the main pads past
 * the tab bar, so no content hides under it. The assistant is a page of its
 * own (`/admin/assistant`), reached from the nav.
 *
 * Immersive routes draw their own chrome, so the bars step aside there.
 */
export function AdminShell({ serverName, user, navCounts, navIds, scoped, children }: AdminShellProps) {
  return (
    <AdminNavProvider ids={navIds} scoped={scoped}>
      <CommandMenuProvider>
        <div className="flex min-h-dvh bg-background" data-testid="admin-shell">
          <AdminChrome>
            <AdminSidebar serverName={serverName} user={user} navCounts={navCounts} />
          </AdminChrome>
          <div className="flex min-w-0 flex-1 flex-col">
            <AdminChrome>
              <AdminMobileBar serverName={serverName} navCounts={navCounts} />
            </AdminChrome>
            {/* `main` fills the screen so a dialog over a short page sits on one stack of elements, which axe needs. */}
            <main
              id="main"
              tabIndex={-1}
              className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none md:pb-6"
            >
              {children}
            </main>
            <AdminChrome>
              <AdminTabBar navCounts={navCounts} />
            </AdminChrome>
          </div>
        </div>
      </CommandMenuProvider>
    </AdminNavProvider>
  )
}
