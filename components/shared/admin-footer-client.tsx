"use client"

import { Session } from "next-auth"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { LLMToggle } from "@/components/admin/settings/llm-toggle"

interface AdminFooterClientProps {
  session: Session | null
  stats: {
    totalTokens: number
    totalCost: number
    totalRequests: number
  }
  totalUsers: number
  shareStats: {
    totalShares: number
    totalVisits: number
  }
  llmDisabled: boolean
}

export function AdminFooterClient({
  session,
  stats,
  totalUsers,
  shareStats,
  llmDisabled,
}: AdminFooterClientProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push("/")
    router.refresh()
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-40">
      <div className="md:hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs text-slate-400 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-slate-500 truncate">
              {session?.user?.name || session?.user?.email || "Anonymous"}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-400 font-mono">
              {stats.totalTokens.toLocaleString()}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-green-400 font-mono">
              ${stats.totalCost.toFixed(2)}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* Mobile: Expanded view */}
        {isExpanded && (
          <div className="px-4 py-3 border-t border-slate-700 space-y-2">
            {/* User info row */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                <span className="text-slate-500">User:</span>{" "}
                <span className="text-white font-mono truncate">
                  {session?.user?.name || session?.user?.email || "Anonymous"}
                </span>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                <span className="text-slate-500">Admin:</span>{" "}
                <span
                  className={`font-mono ${
                    session?.user?.isAdmin ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {session?.user?.isAdmin ? "Yes" : "No"}
                </span>
              </span>
              {session?.user?.id && (
                <>
                  <span className="text-slate-600">|</span>
                  <span>
                    <span className="text-slate-500">ID:</span>{" "}
                    <span className="text-white font-mono text-[10px]">
                      {session.user.id.slice(0, 8)}...
                    </span>
                  </span>
                </>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Tokens:</span>{" "}
                <span className="text-cyan-400 font-mono">
                  {stats.totalTokens.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Cost:</span>{" "}
                <span className="text-green-400 font-mono">
                  ${stats.totalCost.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Users:</span>{" "}
                <span className="text-purple-400 font-mono">
                  {totalUsers.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Generations:</span>{" "}
                <span className="text-blue-400 font-mono">
                  {stats.totalRequests.toLocaleString()}
                </span>
              </div>
              <div>
                <Link
                  href="/admin/shares"
                  className="hover:text-cyan-300 transition-colors"
                >
                  <span className="text-slate-500">Shares:</span>{" "}
                  <span className="text-cyan-400 font-mono">
                    {shareStats.totalShares.toLocaleString()}
                  </span>
                </Link>
              </div>
              <div>
                <Link
                  href="/admin/shares"
                  className="hover:text-green-300 transition-colors"
                >
                  <span className="text-slate-500">Visits:</span>{" "}
                  <span className="text-green-400 font-mono">
                    {shareStats.totalVisits.toLocaleString()}
                  </span>
                </Link>
              </div>
            </div>

            {/* LLM Toggle */}
            <div className="pt-1 border-t border-slate-700">
              <LLMToggle initialDisabled={llmDisabled} />
            </div>

            {/* Navigation links */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-slate-700">
              <Link
                href="/"
                className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium text-sm py-1"
              >
                Home
              </Link>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <Link
                href="/admin"
                className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium text-sm py-1"
              >
                Dashboard →
              </Link>
              <span className="text-slate-600 hidden sm:inline">|</span>
              <button
                onClick={handleSignOut}
                className="text-red-400 hover:text-red-300 transition-colors font-medium text-sm py-1"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: Full horizontal view */}
      <div className="hidden md:block">
        <div className="px-4 py-2 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              <span className="text-slate-500">User:</span>{" "}
              <span className="text-white font-mono">
                {session?.user?.name || session?.user?.email || "Anonymous"}
              </span>
            </span>
            {session && (
              <>
                <span className="text-slate-600">|</span>
                <span>
                  <span className="text-slate-500">Admin:</span>{" "}
                  <span
                    className={`font-mono ${
                      session.user.isAdmin ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {session.user.isAdmin ? "Yes" : "No"}
                  </span>
                </span>
                {session.user.id && (
                  <>
                    <span className="text-slate-600">|</span>
                    <span>
                      <span className="text-slate-500">ID:</span>{" "}
                      <span className="text-white font-mono text-[10px]">
                        {session.user.id.slice(0, 8)}...
                      </span>
                    </span>
                  </>
                )}
                <span className="text-slate-600">|</span>
                <span>
                  <span className="text-slate-500">Tokens:</span>{" "}
                  <span className="text-cyan-400 font-mono">
                    {stats.totalTokens.toLocaleString()}
                  </span>
                </span>
                <span className="text-slate-600">|</span>
                <span>
                  <span className="text-slate-500">Cost:</span>{" "}
                  <span className="text-green-400 font-mono">
                    ${stats.totalCost.toFixed(4)}
                  </span>
                </span>
                <span className="text-slate-600">|</span>
                <span>
                  <span className="text-slate-500">Users:</span>{" "}
                  <span className="text-purple-400 font-mono">
                    {totalUsers.toLocaleString()}
                  </span>
                </span>
                <span className="text-slate-600">|</span>
                <span>
                  <span className="text-slate-500">Generations:</span>{" "}
                  <span className="text-blue-400 font-mono">
                    {stats.totalRequests.toLocaleString()}
                  </span>
                </span>
                <span className="text-slate-600">|</span>
                <Link
                  href="/admin/shares"
                  className="hover:text-cyan-300 transition-colors"
                >
                  <span className="text-slate-500">Shares:</span>{" "}
                  <span className="text-cyan-400 font-mono">
                    {shareStats.totalShares.toLocaleString()}
                  </span>
                </Link>
                <span className="text-slate-600">|</span>
                <Link
                  href="/admin/shares"
                  className="hover:text-green-300 transition-colors"
                >
                  <span className="text-slate-500">Visits:</span>{" "}
                  <span className="text-green-400 font-mono">
                    {shareStats.totalVisits.toLocaleString()}
                  </span>
                </Link>
                <span className="text-slate-600">|</span>
                <LLMToggle initialDisabled={llmDisabled} />
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
            >
              Home
            </Link>
            <Link
              href="/admin"
              className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
            >
              Dashboard →
            </Link>
            <button
              onClick={handleSignOut}
              className="text-red-400 hover:text-red-300 transition-colors font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}

