"use client"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { FreeSpaceTile, sizeParts } from "@/components/admin/cleanup/rules/library-tiles"
import { dayWords } from "@/components/admin/cleanup/rules/rule-card-facts"
import { StatusDot } from "@/components/ui/status-badge"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"

interface StatTilesProps {
  stats: CleanupOverviewData["stats"]
  library: CleanupOverviewData["library"]
  /** Today in the server zone, a day key. */
  today: string
}

/**
 * The four tiles of the Rules tab in normal use (UX 4.1.2, 8.2): the titles
 * in Leaving soon with the next leave date, the deletion batch items that
 * wait for the admin, the space freed in the last 30 days, and the free
 * space with the Leaving soon share in its meter. Freed sizes say "up to",
 * because torrent copies free their space later.
 */
export function StatTiles({ stats, library, today }: StatTilesProps) {
  const f = useFormat()
  const { leaving, waiting, freed30d } = stats
  const freed = sizeParts(freed30d.bytes)
  const freedNoun = nounWord(freed30d.count, freed30d.level ?? "title")
  const growth = library.growthBytesPerMonth === null ? null : `About ${sizeText(library.growthBytesPerMonth)} is added a month`
  return (
    <StatGrid data-testid="admin-cleanup-stats">
      <StatTile
        label="In Leaving soon"
        value={f.number(leaving.count)}
        unit={`${nounWord(leaving.count, "title")}, ${sizeText(leaving.bytes)}`}
        meta={leaving.nextLeaveAt ? `Next leave date: ${dayWords(f, leaving.nextLeaveAt, today)}` : undefined}
        data-testid="admin-cleanup-tile-leaving"
      />
      <StatTile
        label="Waiting for you"
        value={f.number(waiting?.count ?? 0)}
        unit={waiting ? `${nounWord(waiting.count, waiting.level ?? "title")}, ${sizeText(waiting.bytes)}` : nounWord(0, "title")}
        meta={
          waiting && (
            <StatusDot
              tone="warning"
              label={waiting.dueToday ? "Due today" : `Due ${waiting.dueAt < today ? "since " : ""}${dayWords(f, waiting.dueAt, today)}`}
              className="text-label text-muted-foreground"
            />
          )
        }
        data-testid="admin-cleanup-tile-waiting"
      />
      <StatTile
        label="Freed in the last 30 days"
        value={Number(freed30d.bytes) > 0 ? `Up to ${freed.value}` : freed.value}
        unit={freed.unit}
        meta={`${f.number(freed30d.count)} ${freedNoun} deleted. Torrent copies free their space later.`}
        data-testid="admin-cleanup-tile-freed"
      />
      <FreeSpaceTile library={library} leavingBytes={leaving.bytes} meta={growth} />
    </StatGrid>
  )
}
