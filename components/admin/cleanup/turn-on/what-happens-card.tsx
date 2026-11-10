import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { isChangeMode, type TurnOnChoice } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Poster } from "@/components/ui/poster"
import { plural } from "@/lib/cleanup/action-words"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"

/** The storage that `storagePercent` measures: movies, or shows for show and season rules. */
const STORAGE = { movie: "movie", show: "show", season: "show" } as const

/** "Up to 1.3 TB. That is 27 % of your movie storage, or about 4 weeks of new media. Torrent copies free their space later." (UX 8.7). @internal Exported for tests. */
export function sizeLine(data: CleanupTurnOnData): string {
  const { storagePercent, growthWeeks } = data.batch
  const parts: string[] = []
  if (storagePercent !== null) parts.push(`${storagePercent} % of your ${STORAGE[data.rule.level]} storage`)
  if (growthWeeks !== null) parts.push(`about ${growthWeeks === 1 ? "1 week" : `${growthWeeks} weeks`} of new media`)
  const share = parts.length > 0 ? ` That is ${parts.join(", or ")}.` : ""
  return `Up to ${sizeText(data.batch.bytes)}.${share} Torrent copies free their space later.`
}

/** "{N} {items} go into Leaving soon." or, in Change mode, "{N} {items} are in Leaving soon. Their leave dates do not change." @internal Exported for tests. */
export function headline(data: CleanupTurnOnData): string {
  const n = plural(data.count, data.rule.level)
  if (!isChangeMode(data)) return `${n} ${data.count === 1 ? "goes" : "go"} into Leaving soon.`
  return data.count === 1 ? `${n} is in Leaving soon. Its leave date does not change.` : `${n} are in Leaving soon. Their leave dates do not change.`
}

/** "6 shows are due. Automatic deletes them at the next nightly run, inside the budget." (UX 4.6, Change mode). @internal Exported for tests. */
export function dueLine(data: CleanupTurnOnData): string {
  const { dueCount } = data.batch
  const one = dueCount === 1
  return `${plural(dueCount, data.rule.level)} ${one ? "is" : "are"} due. Automatic deletes ${one ? "it" : "them"} at the next nightly run, inside the budget.`
}

function Facts({ data }: { data: CleanupTurnOnData }) {
  const { matches, protectedCount, missingCount } = data.batch
  return (
    <p className="text-ui text-muted-foreground" data-testid="admin-cleanup-turn-on-facts">
      <strong className="font-semibold text-foreground">{matches}</strong> {matches === 1 ? "match" : "matches"}.
      {protectedCount > 0 && (
        <>
          {" "}
          <strong className="font-semibold text-foreground">{protectedCount}</strong> kept safe by Never touch.
        </>
      )}
      {missingCount > 0 && (
        <>
          {" "}
          <strong className="font-semibold text-foreground">{missingCount}</strong> with missing data{" "}
          {missingCount === 1 ? "stays out until its data is complete." : "stay out until their data is complete."}
        </>
      )}
    </p>
  )
}

/** The titles of the posters: the ten largest rows carry them; a poster that no row names is decorative. */
function posterTitles(data: CleanupTurnOnData): Map<string, string> {
  return new Map(data.largest.flatMap((row) => (row.posterKey ? [[row.posterKey, row.title] as const] : [])))
}

function Posters({ data }: { data: CleanupTurnOnData }) {
  const titles = posterTitles(data)
  const more = data.count - data.batch.posters.length
  if (data.batch.posters.length === 0) return null
  // The headline holds the count, so the strip is art only
  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden="true" data-testid="admin-cleanup-turn-on-posters">
      {data.batch.posters.map((key) => (
        <Poster key={key} ratingKey={key} title={titles.get(key) ?? ""} size="xs" decorative />
      ))}
      {more > 0 && <span className="pl-1 text-label text-muted-foreground">and {more} more</span>}
    </div>
  )
}

/**
 * "What happens today" (UX 4.6, 8.7): how many titles go into Leaving soon,
 * their size and share of storage, ten posters, and the matches, the titles
 * that Never touch keeps safe and the ones with missing data. In Change mode
 * it says that the titles keep their leave dates, and, with Automatic chosen,
 * how many are due.
 */
export function WhatHappensCard({ data, mode }: { data: CleanupTurnOnData; mode: TurnOnChoice }) {
  const change = isChangeMode(data)
  return (
    <Card data-testid="admin-cleanup-turn-on-what-happens">
      <CardHeader>
        <CardTitle as="h2">What happens today</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-h2 text-foreground" data-testid="admin-cleanup-turn-on-headline">
          {headline(data)}
        </p>
        {change && mode === "automatic" && data.batch.dueCount > 0 && (
          <p className="text-ui text-foreground" data-testid="admin-cleanup-turn-on-due">
            {dueLine(data)}
          </p>
        )}
        <p className="text-ui text-muted-foreground">{sizeLine(data)}</p>
        <Posters data={data} />
        {!change && <Facts data={data} />}
      </CardContent>
    </Card>
  )
}
