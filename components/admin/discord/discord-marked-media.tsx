"use client"

import { type ComponentProps, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { StyledInput } from "@/components/ui/styled-input"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Time } from "@/components/ui/time"
import { Toggle } from "@/components/ui/toggle"
import { useFormat } from "@/lib/format-context"
import type { MarkType, MediaType } from "@/lib/generated/prisma"

interface MarkedMediaUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

interface MarkedMediaItem {
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

interface MarkTypeSummary {
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

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

/** Human label and Badge variant for each MarkType. */
const MARK_TYPE_META: Record<MarkType, { label: string; variant: BadgeVariant }> = {
  FINISHED_WATCHING: { label: "Finished", variant: "success" },
  KEEP_FOREVER: { label: "Keep Forever", variant: "info" },
  NOT_INTERESTED: { label: "Not Interested", variant: "neutral" },
  REWATCH_CANDIDATE: { label: "Rewatch", variant: "info" },
  POOR_QUALITY: { label: "Poor Quality", variant: "warning" },
  WRONG_VERSION: { label: "Wrong Version", variant: "destructive" },
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
  const f = useFormat()

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
            <Toggle
              key={s.markType}
              size="sm"
              pressed={active}
              onPressedChange={() => setFilter("markType", active ? "all" : s.markType)}
              data-testid={`mark-summary-${s.markType}`}
            >
              {meta.label}
              <span className="font-semibold tabular-nums">{f.number(s.count)}</span>
            </Toggle>
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
            aria-label="Mark type"
            data-testid="marks-type-filter"
          />
        </div>
        <div className="sm:w-40">
          <StyledDropdown
            value={filters.source || "all"}
            onChange={(v) => setFilter("source", v)}
            options={SOURCE_OPTIONS}
            size="md"
            aria-label="Source"
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
        <div className="p-8 text-center text-muted-foreground">
          No marked media matches these filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full">
            <thead className="bg-secondary border-b">
              <tr>
                <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground">
                  Media
                </th>
                <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground">
                  Mark
                </th>
                <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground">
                  Marked By
                </th>
                <th className="px-4 py-3 text-left text-label font-medium text-muted-foreground">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-label font-medium text-muted-foreground">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {marks.map((mark) => {
                const meta = MARK_TYPE_META[mark.markType]
                return (
                  <tr
                    key={mark.id}
                    className="hover:bg-accent"
                    data-testid={`marked-media-row-${mark.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-foreground font-medium">
                          {formatMediaLabel(mark)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {mark.mediaType.replace(/_/g, " ")}
                          {mark.note ? ` · ${mark.note}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">
                        {mark.user.name ?? mark.user.email ?? "Unknown user"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={mark.markedVia === "discord" ? "info" : "neutral"}>
                        {mark.markedVia === "discord" ? "Discord" : mark.markedVia}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      <Time value={mark.markedAt} />
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
          <span className="text-sm text-muted-foreground" data-testid="marks-range">
            Showing {start}–{end} of {f.number(total)}
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
