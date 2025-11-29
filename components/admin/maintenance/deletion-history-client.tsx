"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatBytes } from "@/lib/utils/time-formatting"

type DeletionLog = {
  id: string
  candidateId: string | null
  mediaType: "MOVIE" | "TV_SERIES" | "EPISODE"
  title: string
  year: number | null
  fileSize: bigint | null
  deletedBy: string
  deletedAt: Date
  deletedFrom: string
  filesDeleted: boolean
  ruleNames: unknown
}

type Stats = {
  totalDeletions: number
  totalSpaceReclaimed: number
  filesActuallyDeleted: number
  deletionsThisMonth: number
  byMediaType: Array<{ mediaType: string; count: number }>
  byUser: Array<{ userId: string; count: number }>
}

type Pagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type Props = {
  deletions: DeletionLog[]
  pagination: Pagination
  stats: Stats
  currentFilters: {
    mediaType?: string
    deletedBy?: string
    filesDeleted?: string
    startDate?: string
    endDate?: string
  }
}

export function DeletionHistoryClient({ deletions, pagination, stats, currentFilters }: Props) {
  const router = useRouter()
  const [filters, setFilters] = useState(currentFilters)
  const [isExporting, setIsExporting] = useState(false)

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined }
    setFilters(newFilters)

    // Build query string
    const params = new URLSearchParams()
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })

    router.push(`/admin/maintenance/history?${params.toString()}`)
  }

  const handleExportCSV = () => {
    setIsExporting(true)

    try {
      // Build CSV content
      const headers = [
        "Title",
        "Year",
        "Media Type",
        "Deleted At",
        "Deleted By",
        "File Size",
        "Files Deleted",
        "Deleted From",
        "Rules",
      ]

      const rows = deletions.map((deletion) => {
        const ruleNames = Array.isArray(deletion.ruleNames)
          ? deletion.ruleNames.join("; ")
          : ""

        return [
          deletion.title,
          deletion.year?.toString() || "",
          deletion.mediaType,
          new Date(deletion.deletedAt).toLocaleString(),
          deletion.deletedBy,
          deletion.fileSize ? formatBytes(Number(deletion.fileSize)) : "",
          deletion.filesDeleted ? "Yes" : "No",
          deletion.deletedFrom,
          ruleNames,
        ]
      })

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n")

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `deletion-history-${new Date().toISOString()}.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      setIsExporting(false)
    }
  }

  const clearFilters = () => {
    setFilters({})
    router.push("/admin/maintenance/history")
  }

  const hasActiveFilters =
    filters.mediaType || filters.deletedBy || filters.filesDeleted || filters.startDate || filters.endDate

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Total Deletions</div>
          <div className="text-2xl font-bold text-white">{stats.totalDeletions.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">All time</div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Space Reclaimed</div>
          <div className="text-2xl font-bold text-green-400">
            {formatBytes(stats.totalSpaceReclaimed)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Total storage freed</div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Files Deleted</div>
          <div className="text-2xl font-bold text-red-400">
            {stats.filesActuallyDeleted.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.totalDeletions - stats.filesActuallyDeleted} Plex-only
          </div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">This Month</div>
          <div className="text-2xl font-bold text-cyan-400">
            {stats.deletionsThisMonth.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.totalDeletions > 0
              ? `${Math.round((stats.deletionsThisMonth / stats.totalDeletions) * 100)}% of total`
              : "0% of total"}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-white">Filters</h2>
          <div className="flex gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors"
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={handleExportCSV}
              disabled={isExporting || deletions.length === 0}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded transition-colors"
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="mediaType" className="block text-sm text-slate-400 mb-1">
              Media Type
            </label>
            <select
              id="mediaType"
              value={filters.mediaType || ""}
              onChange={(e) => handleFilterChange("mediaType", e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">All Types</option>
              <option value="MOVIE">Movies</option>
              <option value="TV_SERIES">TV Series</option>
              <option value="EPISODE">Episodes</option>
            </select>
          </div>

          <div>
            <label htmlFor="filesDeleted" className="block text-sm text-slate-400 mb-1">
              Files Deleted
            </label>
            <select
              id="filesDeleted"
              value={filters.filesDeleted || ""}
              onChange={(e) => handleFilterChange("filesDeleted", e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">All</option>
              <option value="true">Yes (files deleted)</option>
              <option value="false">No (Plex only)</option>
            </select>
          </div>

          <div>
            <label htmlFor="startDate" className="block text-sm text-slate-400 mb-1">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={filters.startDate || ""}
              onChange={(e) => handleFilterChange("startDate", e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm text-slate-400 mb-1">
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={filters.endDate || ""}
              onChange={(e) => handleFilterChange("endDate", e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Deletion History Table */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/30 border-b border-slate-700">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                  Year
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                  Type
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Deleted At
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden xl:table-cell">
                  File Size
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Files Deleted
                </th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                  Rules
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {deletions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    No deletions found.
                  </td>
                </tr>
              ) : (
                deletions.map((deletion) => {
                  const ruleNames = Array.isArray(deletion.ruleNames)
                    ? deletion.ruleNames
                    : []

                  return (
                    <tr key={deletion.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-3 sm:px-6 py-4">
                        <div className="text-sm font-medium text-white">{deletion.title}</div>
                        <div className="text-xs text-slate-400 md:hidden">
                          {deletion.year} - {deletion.mediaType}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                        <div className="text-sm text-slate-300">
                          {deletion.year || <span className="text-slate-500">—</span>}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            deletion.mediaType === "MOVIE"
                              ? "bg-blue-500/20 text-blue-400"
                              : deletion.mediaType === "TV_SERIES"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {deletion.mediaType === "MOVIE"
                            ? "Movie"
                            : deletion.mediaType === "TV_SERIES"
                              ? "TV Series"
                              : "Episode"}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-300">
                          <div className="md:hidden">
                            {new Date(deletion.deletedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="hidden md:block">
                            {new Date(deletion.deletedAt).toLocaleString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden xl:table-cell">
                        <div className="text-sm text-slate-300">
                          {deletion.fileSize ? (
                            formatBytes(Number(deletion.fileSize))
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            deletion.filesDeleted
                              ? "bg-red-500/20 text-red-400"
                              : "bg-slate-600/50 text-slate-400"
                          }`}
                        >
                          {deletion.filesDeleted ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 hidden lg:table-cell">
                        <div className="text-xs text-slate-400">
                          {ruleNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {ruleNames.map((rule: string, idx: number) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-slate-700 rounded text-slate-300"
                                >
                                  {rule}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500">Manual</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 sm:px-6 py-4 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs sm:text-sm text-slate-400">
              Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
              {pagination.total} results
            </div>
            <div className="flex gap-2">
              {pagination.page > 1 && (
                <Link
                  href={`/admin/maintenance/history?page=${pagination.page - 1}${
                    Object.entries(currentFilters)
                      .filter(([_, v]) => v)
                      .map(([k, v]) => `&${k}=${v}`)
                      .join("")
                  }`}
                  className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded transition-colors"
                >
                  Previous
                </Link>
              )}
              {pagination.page < pagination.totalPages && (
                <Link
                  href={`/admin/maintenance/history?page=${pagination.page + 1}${
                    Object.entries(currentFilters)
                      .filter(([_, v]) => v)
                      .map(([k, v]) => `&${k}=${v}`)
                      .join("")
                  }`}
                  className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
