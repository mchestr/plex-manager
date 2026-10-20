"use client"

import { Chatbot } from "@/components/admin/chatbot/chat-window"
import { AdminNav } from "@/components/admin/shared/admin-nav"
import { cn } from "@/lib/utils"
import { usePathname } from "next/navigation"
import { type ReactNode, useMemo } from "react"

const immersiveRoutePatterns = [
  /^\/admin\/users\/[^/]+\/wrapped/,
  /^\/admin\/wrapped\/[^/]+\/history\/[^/]+/,
]

type AdminLayoutShellProps = {
  children: ReactNode
  hasChatLLM: boolean
  chatUserName?: string
}

export function AdminLayoutShell({ children, hasChatLLM, chatUserName }: AdminLayoutShellProps) {
  const pathname = usePathname()
  const hideChrome = useMemo(
    () => (pathname ? immersiveRoutePatterns.some((pattern) => pattern.test(pathname)) : false),
    [pathname]
  )

  // `main` fills the screen so a dialog over a short page sits on one stack
  // of elements, which axe needs to measure the dialog's contrast.
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {!hideChrome && <AdminNav />}
      <main id="main" tabIndex={-1} className={cn("outline-none flex-1 pb-20 md:pb-6 transition-all", hideChrome ? "md:ml-0" : "md:ml-64")}>
        {children}
      </main>
      {hasChatLLM && <Chatbot userName={chatUserName} />}
    </div>
  )
}

