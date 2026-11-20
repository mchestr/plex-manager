"use client"

import type { ReactNode } from "react"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { StatusDot } from "@/components/ui/status-badge"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { RuleCardData } from "@/lib/cleanup/types/rule-parts"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"

/** A day key in a line of the page: "Nov 19" in the year of `today`, else "Nov 19, 2025" (UX 4). */
export function dayWords(f: BoundFormat, key: string, today: string): string {
  return f.dayKey(key, key.slice(0, 4) === today.slice(0, 4) ? "day-month-short" : "short")
}

/** The day key of an instant in the app zone. */
export const dayOf = (f: BoundFormat, iso: string): string => dayKey(Date.parse(iso), f.settings.timeZone)

interface Fact {
  id: string
  label: string
  value: ReactNode
  sub?: string | null
}

/** "197 movies, 1.3 TB". */
const countBytes = (f: BoundFormat, count: number, level: RuleCardData["level"], bytes: string) =>
  `${f.number(count)} ${nounWord(count, level)}, ${sizeText(bytes)}`

/** The three facts of a rule's mode (UX 4.1.3 item 4, 8.2). */
function factsOf(card: RuleCardData, f: BoundFormat, today: string): Fact[] {
  const { facts, level } = card
  const { matches, dryRuns, leaving, waiting, deleted } = facts
  const items = (count: number) => `${f.number(count)} ${nounWord(count, level)}`
  const growth = matches.growthWeeks === null ? null : `Up to, about ${matches.growthWeeks} ${matches.growthWeeks === 1 ? "week" : "weeks"} of growth`
  const matchesFact = (sub: string | null): Fact => ({ id: "matches", label: "Matches today", value: countBytes(f, matches.count, level, matches.bytes), sub })
  const leavingFact = (sub: string | null): Fact => ({
    id: "leaving",
    label: "In Leaving soon",
    value: countBytes(f, leaving?.count ?? 0, level, leaving?.bytes ?? "0"),
    sub,
  })

  if (card.mode === "dryRun") {
    const since = dryRuns.sinceDay ? ` since ${dayWords(f, dryRuns.sinceDay, today)}` : ""
    // One value when every dry run found the same count, as the turn-on page says it (UX review UX-09)
    const range = dryRuns.min === null || dryRuns.max === null ? null
      : dryRuns.min === dryRuns.max ? `Matches stayed at ${f.number(dryRuns.min)}` : `Between ${f.number(dryRuns.min)} and ${f.number(dryRuns.max)} matches`
    return [
      matchesFact(growth),
      { id: "dry-runs", label: "Dry runs", value: dryRuns.count > 0 ? `${f.number(dryRuns.count)}${since}` : "Nothing yet", sub: range },
      { id: "members", label: "Members see", value: "Nothing yet", sub: "A dry run changes nothing" },
    ]
  }
  if (card.mode === "reviewFirst") {
    const fresh = matches.newSinceLastRun
    const next = leaving?.nextLeaveOn ? `Next leave date: ${dayWords(f, leaving.nextLeaveOn, today)}` : null
    return [
      matchesFact(fresh === null ? null : `${f.number(fresh)} new since the last run`),
      leavingFact(leaving?.turnedOnAt ? `Turned on ${dayWords(f, dayOf(f, leaving.turnedOnAt), today)}` : null),
      waiting
        ? {
            id: "waiting",
            label: "Waiting for you",
            value: (
              <StatusDot
                tone="warning"
                label={`${items(waiting.count)}, due ${waiting.dueToday ? "today" : `${waiting.dueOn < today ? "since " : ""}${dayWords(f, waiting.dueOn, today)}`}`}
                className="font-medium"
              />
            ),
            sub: sizeText(waiting.bytes),
          }
        : { id: "waiting", label: "Waiting for you", value: items(0), sub: next },
    ]
  }
  const next = leaving?.nextLeaveOn ? `Next: ${dayWords(f, leaving.nextLeaveOn, today)}, ${items(leaving.nextCount)}` : null
  return [
    matchesFact(null),
    leavingFact(next),
    {
      id: "deleted",
      label: "Deleted",
      value: `${items(deleted?.count ?? 0)}, up to ${sizeText(deleted?.bytes ?? "0")}`,
      sub: deleted?.since ? `Since ${dayWords(f, deleted.since, today)}` : null,
    },
  ]
}

/**
 * The three facts of a rule card by mode (UX 4.1.3 item 4): Dry run shows
 * the matches today, the dry runs of this version and that members see
 * nothing. Review first shows the matches, Leaving soon and the batch that
 * waits. Automatic shows the matches, Leaving soon with the next leave date,
 * and what it deleted. Three columns from `sm`, two below.
 */
export function RuleCardFacts({ card, today }: { card: RuleCardData; today: string }) {
  const f = useFormat()
  return (
    <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3" data-testid={`admin-cleanup-rule-${card.id}-facts`}>
      {factsOf(card, f, today).map((fact) => (
        <div key={fact.id} className="flex min-w-0 flex-col gap-1" data-testid={`admin-cleanup-rule-${card.id}-fact-${fact.id}`}>
          <dt className="text-label text-muted-foreground">{fact.label}</dt>
          <dd className="text-ui font-medium text-foreground tabular-nums">{fact.value}</dd>
          {fact.sub && <dd className="text-label text-muted-foreground">{fact.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}
