"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { StyledInput } from "@/components/ui/styled-input"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/utils/time-formatting"
import type { MarkType, MediaType } from "@/lib/generated/prisma"

export interface MarkedMediaUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

export interface MarkedMediaItem {
  id: string
  title: string
  year: number | null
  mediaType: MediaType
  markType: MarkType
  seasonNumber: number | null
  episodeNumber: number | null
  parentTitle: string | null
  note: string | null
  markedVia: string
  markedAt: string
  radarrTitleSlug: string | null
  sonarrTitleSlug: string | null
  user: MarkedMediaUser
}

export interface MarkTypeSummary {
  markType: MarkType
  count: number
}

interface DiscordMarkedMediaProps {
  marks: MarkedMediaItem[]
  total: number
  summary: MarkTypeSummary[]
  /** Current filters, from the page's search params. */
  filters: { markType: string; source: string; search: string }
  /** Current pagination offset. */
  offset: number
  /** Page size used to fetch. */
  limit: number
}

/** Human label + accent color for each MarkType. */
const MARK_TYPE_META: Record<MarkType, { label: string; color: string; chip: string }> = {
  FINISHED_WATCHING: {
    label: "Finished",
    color: "text-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  KEEP_FOREVER: {
    label: "Keep Forever",
    color: "text-purple-400",
    chip: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  NOT_INTERESTED: {
    label: "Not Interested",
    color: "text-slate-400",
    chip: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  },
  REWATCH_CANDIDATE: {
    label: "Rewatch",
    color: "text-cyan-400",
    chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  POOR_QUALITY: {
    label: "Poor Quality",
    color: "text-amber-400",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  WRONG_VERSION: {
    label: "Wrong Version",
    color: "text-rose-400",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
}

const MARK_TYPE_OPTIONS = [
  { value: "all", label: "All mark types" },
  ...Object.entries(MARK_TYPE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
]

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "discord", label: "Discord" },
  { value: "web", label: "Web" },
]

function formatMediaLabel(item: MarkedMediaItem): string {
  const yearPart = item.year ? ` (${item.year})` : ""
  if (item.mediaType === "EPISODE" && item.seasonNumber != null && item.episodeNumber != null) {
    const show = item.parentTitle ? `${item.parentTitle} — ` : ""
    return `${show}${item.title} S${item.seasonNumber}E${item.episodeNumber}`
  }
  return `${item.title}${yearPart}`
}

export function DiscordMarkedMedia({
  marks,
  total,
  summary,
  filters,
  offset,
  limit,
}: DiscordMarkedMediaProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "all" && value !== "") {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }
      // Any filter change resets pagination.
      if (!("marksOffset" in updates)) {
        params.delete("marksOffset")
      }
      router.push(`/admin/discord?${params.toString()}#marked-media`)
    },
    [router, searchParams]
  )

  const setFilter = (key: "markType" | "source", value: string) => {
    updateParams({ [key]: value })
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = new FormData(e.currentTarget).get("marksSearch")?.toString() ?? ""
    updateParams({ marksSearch: value })
  }

  const goToOffset = (newOffset: number) => {
    updateParams({ marksOffset: newOffset > 0 ? String(newOffset) : null })
  }

  const start = total === 0 ? 0 : offset + 1
  const end = Math.min(offset + limit, total)
  const hasPrev = offset > 0
  const hasNext = offset + limit < total

  return (
    <div data-testid="discord-marked-media">
      {/* Per-type summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {summary.map((s) => {
          const meta = MARK_TYPE_META[s.markType]
          const active = filters.markType === s.markType
          return (
            <button
              key={s.markType}
              type="button"
              onClick={() => setFilter("markType", active ? "all" : s.markType)}
              data-testid={`mark-summary-${s.markType}`}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${meta.chip} ${
                active ? "ring-2 ring-offset-1 ring-offset-slate-900 ring-current" : "hover:brightness-125"
              }`}
            >
              {meta.label}
              <span className="ml-2 font-bold">{s.count.toLocaleString()}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="sm:w-48">
          <StyledDropdown
            value={filters.markType || "all"}
            onChange={(v) => setFilter("markType", v)}
            options={MARK_TYPE_OPTIONS}
            size="md"
            data-testid="marks-type-filter"
          />
        </div>
        <div className="sm:w-40">
          <StyledDropdown
            value={filters.source || "all"}
            onChange={(v) => setFilter("source", v)}
            options={SOURCE_OPTIONS}
            size="md"
            data-testid="marks-source-filter"
          />
        </div>
        <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1">
          <StyledInput
            name="marksSearch"
            defaultValue={filters.search}
            placeholder="Search by title…"
            className="flex-1"
            data-testid="marks-search-input"
          />
          <Button type="submit" variant="secondary" data-testid="marks-search-submit">
            Search
          </Button>
        </form>
      </div>

      {/* Table */}
      {marks.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          No marked media matches these filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-700 rounded-lg">
          <table className="w-full">
            <thead className="bg-slate-700/30 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Media
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Mark
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Marked By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {marks.map((mark) => {
                const meta = MARK_TYPE_META[mark.markType]
                return (
                  <tr
                    key={mark.id}
                    className="hover:bg-slate-700/20"
                    data-testid={`marked-media-row-${mark.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-200 font-medium">
                          {formatMediaLabel(mark)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {mark.mediaType.replace(/_/g, " ")}
                          {mark.note ? ` · ${mark.note}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded border text-xs font-medium ${meta.chip}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-300">
                        {mark.user.name ?? mark.user.email ?? "Unknown user"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          mark.markedVia === "discord"
                            ? "bg-indigo-500/15 text-indigo-300"
                            : "bg-slate-600/40 text-slate-300"
                        }`}
                      >
                        {mark.markedVia === "discord" ? "Discord" : mark.markedVia}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-400">
                      {formatRelativeTime(mark.markedAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-400" data-testid="marks-range">
            Showing {start}–{end} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!hasPrev}
              onClick={() => goToOffset(Math.max(0, offset - limit))}
              data-testid="marks-prev"
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasNext}
              onClick={() => goToOffset(offset + limit)}
              data-testid="marks-next"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
