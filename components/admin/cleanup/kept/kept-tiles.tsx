import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import type { ProtectionTiles } from "@/lib/cleanup/types/list-parts"

const word = (count: number, one: string, other: string) => (count === 1 ? one : other)

/**
 * The four tiles of the Kept and excluded tab (UX 4.8, 8.7): member Keeps
 * with the members who keep titles and the Keep length, admin exclusions
 * with those that have an end date, Keep forever marks, and the Keeps that
 * end in the next 7 days.
 */
export function KeptTiles({ tiles }: { tiles: ProtectionTiles }) {
  const { keeps, excludes, keepForever, endingSoon } = tiles
  return (
    <StatGrid data-testid="admin-cleanup-kept-tiles">
      <StatTile
        label="Kept by members"
        value={keeps.count}
        unit={word(keeps.count, "title", "titles")}
        meta={`${keeps.members} ${word(keeps.members, "member keeps", "members keep")} titles. A Keep lasts ${keeps.keepDays} ${word(keeps.keepDays, "day", "days")}.`}
      />
      <StatTile
        label="Excluded by you"
        value={excludes.count}
        unit={word(excludes.count, "title", "titles")}
        meta={`${excludes.withEnd} ${word(excludes.withEnd, "has", "have")} an end date`}
      />
      <StatTile
        label="Keep forever marks"
        value={keepForever.count}
        unit={word(keepForever.count, "title", "titles")}
        meta="From /mark in Discord. Members change them on Account."
      />
      <StatTile
        label="Ending in 7 days"
        value={endingSoon.count}
        unit={word(endingSoon.count, "Keep", "Keeps")}
        meta="They can join Leaving soon again with a new leave date"
      />
    </StatGrid>
  )
}
