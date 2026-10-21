import type { ReactNode } from "react"

import { AssistantSheet } from "@/components/admin/chatbot/assistant-sheet"
import { ChatProvider } from "@/components/admin/chatbot/chat-context"
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
 * mobile top bar and tab bar below it, the assistant Sheet, and the page's
 * one `<main id="main">`. Below `md` the main pads past the tab bar, so no
 * content hides under it.
 *
 * Immersive routes draw their own chrome, so the bars and the assistant
 * step aside there (`ASSISTANT_HIDDEN`).
 */
export function AdminShell({ serverName, user, navCounts, assistant, children }: AdminShellProps) {
  return (
    <ChatProvider>
      <div className="flex min-h-dvh bg-background" data-testid="admin-shell">
        <AdminChrome>
          <AdminSidebar serverName={serverName} user={user} navCounts={navCounts} assistant={assistant} />
        </AdminChrome>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminChrome>
            <AdminMobileBar serverName={serverName} navCounts={navCounts} assistant={assistant} />
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
        {assistant && (
          <AdminChrome part="assistant">
            <AssistantSheet userName={user.name} />
          </AdminChrome>
        )}
      </div>
    </ChatProvider>
  )
}
