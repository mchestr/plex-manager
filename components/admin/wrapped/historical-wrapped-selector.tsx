"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"

interface HistoricalVersion {
  id: string
  createdAt: Date | string
  provider: string
  model: string | null
  cost: number
  totalTokens: number
  isCurrent?: boolean
}

interface HistoricalWrappedSelectorProps {
  wrappedId: string
  userId: string
}

export function HistoricalWrappedSelector({
  wrappedId,
  userId,
}: HistoricalWrappedSelectorProps) {
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
        // Navigate back to current version
        setSelectedVersion("current")
        await router.push(`/admin/users/${userId}/wrapped`)
      } else {
        // Check if this version is marked as current
        const version = versions.find(v => v.id === versionId)
        if (version?.isCurrent) {
          // If clicking on the current version, navigate to current page
          setSelectedVersion("current")
          await router.push(`/admin/users/${userId}/wrapped`)
        } else {
          // Navigate to historical version
          setSelectedVersion(versionId)
          await router.push(`/admin/wrapped/${wrappedId}/history/${versionId}`)
        }
      }
    } catch (error) {
      console.error("Failed to navigate to version:", error)
      // Reset selection on error
      const historyMatch = pathname?.match(/\/admin\/wrapped\/[^/]+\/history\/([^/]+)/)
      if (historyMatch) {
        setSelectedVersion(historyMatch[1])
      } else {
        setSelectedVersion("current")
      }
    }
  }


  if (loading) {
    return (
      <div className="fixed bottom-[32px] left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <p className="text-slate-400 text-xs">Loading versions...</p>
        </div>
      </div>
    )
  }

  if (versions.length === 0) {
    return null
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

  return (
    <div className="fixed bottom-[32px] left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-white">Historical Versions</h3>
          <div className="flex items-center gap-2">
            {selectedVersionData && (
              <span className="text-xs text-slate-400">
                {selectedVersion === "current" ? "Current" : formatDate(selectedVersionData.createdAt)}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="gap-1.5"
            >
              <span>{versions.length} version{versions.length !== 1 ? "s" : ""}</span>
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
            </Button>
          </div>
        </div>
        {isExpanded && (
          <div className="flex gap-2 overflow-x-auto pb-2 mt-2">
            {versions.map((version) => {
              // Determine if this version should be highlighted as selected
              const isSelected = selectedVersion === version.id ||
                (selectedVersion === "current" && version.isCurrent)

              return (
                <Button
                  key={version.id}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    handleVersionChange(version.isCurrent ? "current" : version.id)
                    setIsExpanded(false)
                  }}
                  className={`flex-shrink-0 min-w-[200px] ${
                    isSelected
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : ""
                  }`}
                >
                  <div className="text-white">
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium text-[11px]">{formatDate(version.createdAt)}</div>
                      {version.isCurrent && (
                        <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {version.provider}/{version.model || "unknown"}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {formatCost(version.cost)} • {version.totalTokens.toLocaleString()} tokens
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

