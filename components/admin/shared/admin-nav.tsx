"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { type ReactNode } from "react"

type NavItem = {
  href: string
  label: string
  icon: ReactNode
  testId: string
}

// Navigation items organized by logical groups
// Group 1: Core Management (most frequently accessed)
const coreNavItems: NavItem[] = [
  {
    href: "/admin/users",
    label: "Users",
    testId: "admin-nav-users",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    href: "/admin/shares",
    label: "Share Analytics",
    testId: "admin-nav-share-analytics",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
  },
  {
    href: "/admin/invites",
    label: "Invites",
    testId: "admin-nav-invites",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
  },
]

// Group 2: Monitoring & Analytics
const analyticsNavItems: NavItem[] = [
  {
    href: "/admin/llm-usage",
    label: "LLM Usage",
    testId: "admin-nav-llm-usage",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: "/admin/cost-analysis",
    label: "Cost Analysis",
    testId: "admin-nav-cost-analysis",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

// Group 3: Prompts & Testing
const configNavItems: NavItem[] = [
  {
    href: "/admin/prompts",
    label: "Prompts",
    testId: "admin-nav-prompts",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: "/admin/playground",
    label: "Playground",
    testId: "admin-nav-playground",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
]

// Group 4: System (always at bottom)
const systemNavItems: NavItem[] = [
  {
    href: "/admin/settings",
    label: "Settings",
    testId: "admin-nav-settings",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

// Flattened array for mobile navigation (no separators needed)
const navItems: NavItem[] = [...coreNavItems, ...analyticsNavItems, ...configNavItems, ...systemNavItems]

export function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push("/")
    router.refresh()
  }

  // Check if current path matches a nav item
  const isActive = (href: string) => {
    // Handle undefined or null pathname
    if (!pathname) {
      return false
    }

    if (href === "/admin/users") {
      return pathname === "/admin/users" || pathname === "/admin"
    }
    if (href === "/admin/prompts") {
      // Prompts is active for /admin/prompts and /admin/prompts/[id] but not /admin/playground
      return pathname.startsWith("/admin/prompts") && !pathname.startsWith("/admin/playground")
    }
    return pathname.startsWith(href)
  }

  const renderNavItem = (item: NavItem, mobile = false) => {
    const active = isActive(item.href)

    if (mobile) {
      return (
        <Link
          key={item.href}
          href={item.href}
          data-testid={item.testId}
          className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-all min-w-0 flex-1 ${
            active ? "text-cyan-400" : "text-slate-400"
          }`}
        >
          <div className={`transition-colors ${active ? "text-cyan-400" : "text-slate-500"}`}>
            {item.icon}
          </div>
          <span className="text-xs font-medium truncate w-full text-center">
            {item.label.split(" ")[0]}
          </span>
          {active && (
            <div className="w-1 h-1 rounded-full bg-cyan-400"></div>
          )}
        </Link>
      )
    }

    // Desktop
    return (
      <Link
        key={item.href}
        href={item.href}
        data-testid={item.testId}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all group ${
          active
            ? "bg-gradient-to-r from-cyan-600/20 to-purple-600/20 border border-cyan-500/30 text-cyan-400"
            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
        }`}
      >
        <div
          className={`transition-colors ${
            active ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"
          }`}
        >
          {item.icon}
        </div>
        <span className="font-medium text-sm">{item.label}</span>
        {active && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
        )}
      </Link>
    )
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-slate-900/95 backdrop-blur-sm border-r border-slate-700 z-40 flex-col">
        <div className="p-6 border-b border-slate-700">
          <Link href="/admin/users" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-purple-600 flex items-center justify-center group-hover:from-cyan-500 group-hover:to-purple-500 transition-all">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-white">Admin Panel</div>
              <div className="text-xs text-slate-400">Plex Manager</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Core Management */}
          <div className="space-y-1">
            {coreNavItems.map((item) => renderNavItem(item))}
          </div>

          {/* Monitoring & Analytics */}
          <div className="space-y-1">
            <div className="px-4 mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Analytics
              </span>
            </div>
            {analyticsNavItems.map((item) => renderNavItem(item))}
          </div>

          {/* Prompts & Testing */}
          <div className="space-y-1">
            <div className="px-4 mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Prompts & Testing
              </span>
            </div>
            {configNavItems.map((item) => renderNavItem(item))}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-700 space-y-1">
          {systemNavItems.map((item) => renderNavItem(item))}
          <Link
            href="/"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all group"
          >
            <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-medium text-sm">Back to Home</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all group"
          >
            <svg className="w-5 h-5 text-slate-500 group-hover:text-red-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-50 pb-2">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => renderNavItem(item, true))}
        </div>
      </nav>

    </>
  )
}
