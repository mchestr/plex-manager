"use client"

import type { ReactNode } from "react"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"

type Library = CleanupOverviewData["library"]

/** "25.6 TB" as the tile value "25.6" and the unit "TB". A zero size reads "0 GB". */
export function sizeParts(bytes: string | null): { value: string; unit: string } {
  const [value, unit = ""] = sizeText(bytes).split(" ")
  return { value, unit }
}

const num = (bytes: string | null): number | null => (bytes === null ? null : Number(bytes))

interface FreeSpaceTileProps {
  library: Pick<Library, "freeBytes" | "totalBytes">
  /** The bytes in Leaving soon: their share of the disk shows in `chart-1` (TS 12.7 item 5). Omit on first use. */
  leavingBytes?: string
  meta: ReactNode
}

/**
 * "Free space: 25.6 TB of 84 TB" (UX 4.1.1, 4.1.2), with a meter of the
 * used space, the Leaving soon share of it, and the free space. A dash
 * while the disk size is unknown.
 */
export function FreeSpaceTile({ library, leavingBytes, meta }: FreeSpaceTileProps) {
  const free = num(library.freeBytes)
  const total = num(library.totalBytes)
  if (free === null || total === null || total <= 0) {
    return <StatTile label="Free space" value={null} meta={meta} data-testid="admin-cleanup-tile-free" />
  }
  const used = Math.max(0, total - free)
  const leaving = Math.min(used, num(leavingBytes ?? null) ?? 0)
  const { value, unit } = sizeParts(library.freeBytes)
  return (
    <StatTile
      label="Free space"
      value={value}
      unit={`${unit} of ${sizeText(library.totalBytes)}`}
      meter={[
        { value: used - leaving, tone: "info", label: `${sizeText(String(used - leaving))} used` },
        ...(leaving > 0 ? [{ value: leaving, tone: "chart-1" as const, label: `${sizeText(String(leaving))} in Leaving soon` }] : []),
        { value: free, tone: "neutral", label: `${sizeText(library.freeBytes)} free` },
      ]}
      meta={meta}
      data-testid="admin-cleanup-tile-free"
    />
  )
}

/** "About 18 months of space at this growth" (TS 12.7 item 3): the free space over the growth, rounded down. */
export function monthsOfSpace(library: Pick<Library, "freeBytes" | "growthBytesPerMonth">): string | null {
  const free = num(library.freeBytes)
  const growth = num(library.growthBytesPerMonth)
  if (free === null || growth === null || growth <= 0) return null
  const months = Math.floor(free / growth)
  return `About ${months} ${months === 1 ? "month" : "months"} of space at this growth`
}

/**
 * The library tiles of the first-use state (UX 4.1.1, 8.2): the movies and
 * the shows in scope with their sizes, the free space, and the growth a
 * month. Before the first library read the counts are 0 and the disk tiles
 * show a dash.
 */
export function LibraryTiles({ library }: { library: Library }) {
  const f = useFormat()
  const growth = library.growthBytesPerMonth === null ? null : sizeParts(library.growthBytesPerMonth)
  const { movies, shows } = library
  return (
    <StatGrid data-testid="admin-cleanup-library-tiles">
      <StatTile label="Movies" value={f.number(movies.count)} unit={movies.count === 1 ? "movie" : "movies"} meta={sizeText(movies.bytes)} />
      <StatTile
        label="TV shows"
        value={f.number(shows.count)}
        unit={shows.count === 1 ? "show" : "shows"}
        meta={`${sizeText(shows.bytes)} in ${f.number(shows.seasons)} ${shows.seasons === 1 ? "season" : "seasons"}`}
      />
      <FreeSpaceTile library={library} meta={monthsOfSpace(library)} />
      <StatTile
        label="Growth"
        value={growth?.value ?? null}
        unit={growth ? `${growth.unit} a month` : undefined}
        meta={growth ? "Average of the last 6 months" : undefined}
      />
    </StatGrid>
  )
}
