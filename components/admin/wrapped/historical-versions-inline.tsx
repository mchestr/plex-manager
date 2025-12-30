"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { StyledDropdown } from "@/components/ui/select"

interface HistoricalVersion {
  id: string
  createdAt: Date | string
  provider: string
  model: string | null
  cost: number
  totalTokens: number
}

export function HistoricalVersionsInline() {
  const pathname = usePathname()
  const router = useRouter()
  const [versions, setVersions] = useState<HistoricalVersion[]>([])
  const [_loading, setLoading] = useState(false)
  const [wrappedId, setWrappedId] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string>("current")

  const loadVersions = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/wrapped/${id}/versions`)
      if (response.ok) {
        const data = await response.json()
        setVersions(data.versions || [])
      }
    } catch (error) {
      console.error("Failed to load historical versions:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchWrappedId = useCallback(async () => {
    try {
      // Extract userId from pathname
      const userIdMatch = pathname?.match(/\/admin\/users\/([^/]+)\/wrapped/)
      if (!userIdMatch) return

      const userId = userIdMatch[1]
      const currentYear = new Date().getFullYear()

      // Fetch wrapped to get wrappedId
      const response = await fetch(`/api/admin/wrapped/by-user/${userId}?year=${currentYear}`)
      if (response.ok) {
        const data = await response.json()
        if (data.wrappedId) {
          setWrappedId(data.wrappedId)
          loadVersions(data.wrappedId)
        }
      }
    } catch (error) {
      console.error("Failed to fetch wrappedId:", error)
    }
  }, [pathname, loadVersions])

  // Extract wrappedId from pathname if on a wrapped page
  useEffect(() => {
    // Check if we're on a wrapped page: /admin/users/[userId]/wrapped or historical version page
    const wrappedMatch = pathname?.match(/\/admin\/users\/[^/]+\/wrapped/)
    const historyMatch = pathname?.match(/\/admin\/wrapped\/([^/]+)\/history\/([^/]+)/)

    if (historyMatch) {
      // On historical version page
      setWrappedId(historyMatch[1])
      setSelectedVersion(historyMatch[2])
      loadVersions(historyMatch[1])
    } else if (wrappedMatch) {
      // On current wrapped page
      setSelectedVersion("current")
      fetchWrappedId()
    } else {
      setWrappedId(null)
      setVersions([])
      setSelectedVersion("current")
    }
  }, [pathname, fetchWrappedId, loadVersions])

  const handleVersionChange = async (versionId: string) => {
    if (!wrappedId) return

    setSelectedVersion(versionId)

    if (versionId === "current") {
      // Navigate back to current version - need to get userId from wrappedId
      try {
        const response = await fetch(`/api/admin/wrapped/${wrappedId}/user`)
        if (response.ok) {
          const data = await response.json()
          if (data.userId) {
            router.push(`/admin/users/${data.userId}/wrapped`)
          }
        }
      } catch (error) {
        console.error("Failed to get userId:", error)
      }
    } else {
      // Navigate to historical version
      router.push(`/admin/wrapped/${wrappedId}/history/${versionId}`)
    }
  }

  // Only show if we have versions
  if (!wrappedId || versions.length === 0) {
    return null
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <>
      <span className="text-slate-600">|</span>
      <span className="flex items-center gap-2">
        <span className="text-slate-500">Version:</span>
        <StyledDropdown
          value={selectedVersion}
          onChange={handleVersionChange}
          options={[
            { value: "current", label: "Current" },
            ...versions.map((version) => ({
              value: version.id,
              label: `${formatDate(version.createdAt)} (${version.provider}/${version.model || "unknown"})`,
            })),
          ]}
          size="sm"
          className="min-w-[200px]"
        />
      </span>
    </>
  )
}

