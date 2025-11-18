"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

interface HistoricalVersion {
  id: string
  createdAt: Date | string
  provider: string
  model: string | null
  cost: number
  totalTokens: number
  isCurrent?: boolean
}

interface HistoricalWrappedSelectorHeaderProps {
  wrappedId: string
  userId: string
}

export function HistoricalWrappedSelectorHeader({
  wrappedId,
  userId,
}: HistoricalWrappedSelectorHeaderProps) {
  const [versions, setVersions] = useState<HistoricalVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVersion, setSelectedVersion] = useState<string>("current")
  const [isExpanded, setIsExpanded] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function loadVersions() {
      try {
        const response = await fetch(`/api/admin/wrapped/${wrappedId}/versions`)
        if (response.ok) {
          const data = await response.json()
          setVersions(data.versions || [])
        }
      } catch (error) {
        console.error("Failed to load historical versions:", error)
      } finally {
        setLoading(false)
      }
    }

    if (wrappedId) {
      loadVersions()
    }
  }, [wrappedId])

  // Detect current version from pathname
  useEffect(() => {
    const historyMatch = pathname?.match(/\/admin\/wrapped\/[^/]+\/history\/([^/]+)/)
    if (historyMatch) {
      setSelectedVersion(historyMatch[1])
    } else if (pathname?.includes(`/admin/users/${userId}/wrapped`)) {
      setSelectedVersion("current")
    }
  }, [pathname, userId])

  const handleVersionChange = async (versionId: string) => {
    try {
      if (versionId === "current") {
        setSelectedVersion("current")
        await router.push(`/admin/users/${userId}/wrapped`)
      } else {
        const version = versions.find(v => v.id === versionId)
        if (version?.isCurrent) {
          setSelectedVersion("current")
          await router.push(`/admin/users/${userId}/wrapped`)
        } else {
          setSelectedVersion(versionId)
          await router.push(`/admin/wrapped/${wrappedId}/history/${versionId}`)
        }
      }
      setIsExpanded(false)
    } catch (error) {
      console.error("Failed to navigate to version:", error)
      const historyMatch = pathname?.match(/\/admin\/wrapped\/[^/]+\/history\/([^/]+)/)
      if (historyMatch) {
        setSelectedVersion(historyMatch[1])
      } else {
        setSelectedVersion("current")
      }
    }
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`
  }

  const currentVersion = versions.find(v => v.isCurrent)
  const selectedVersionData = selectedVersion === "current"
    ? currentVersion
    : versions.find(v => v.id === selectedVersion)

  // Don't show if no versions or still loading
  if (loading || versions.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-800/50 hover:bg-slate-800 border border-slate-600 hover:border-cyan-500/50 rounded-md transition-colors text-slate-300 hover:text-white"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="font-medium">
          {selectedVersion === "current" ? "Current" : formatDate(selectedVersionData?.createdAt || new Date())}
        </span>
        <span className="text-slate-500">({versions.length})</span>
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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

      {isExpanded && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsExpanded(false)}
          />
          {/* Dropdown menu */}
          <div className="absolute top-full right-0 mt-2 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[280px] max-h-[400px] overflow-y-auto">
            <div className="p-2 space-y-1">
              {versions.map((version) => {
                const isSelected = selectedVersion === version.id ||
                  (selectedVersion === "current" && version.isCurrent)

                return (
                  <button
                    key={version.id}
                    onClick={() => handleVersionChange(version.isCurrent ? "current" : version.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                      isSelected
                        ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                        : "hover:bg-slate-700/50 text-slate-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">
                            {formatDate(version.createdAt)}
                          </span>
                          {version.isCurrent && (
                            <span className="flex-shrink-0 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {version.provider}/{version.model || "unknown"}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatCost(version.cost)} • {version.totalTokens.toLocaleString()} tokens
                        </div>
                      </div>
                      {isSelected && (
                        <svg
                          className="w-4 h-4 text-cyan-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

