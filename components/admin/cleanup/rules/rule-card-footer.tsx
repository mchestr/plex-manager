"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { dayOf, dayWords } from "@/components/admin/cleanup/rules/rule-card-facts"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cleanup } from "@/lib/admin/routes"
import { blockCause } from "@/lib/cleanup/blocks"
import { nounWord, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { RuleCardData, RuleFooter } from "@/lib/cleanup/types/rule-parts"
import { useFormat } from "@/lib/format-context"
import { addDays } from "@/lib/ui/date-range"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

/** "No dry run of this version yet" (UX 8.2, TS 12.7 item 12): a Dry run rule with no other footer line. */
export const NO_DRY_RUN = "No dry run of this version yet"

/** "today", "yesterday", or "on Nov 3". */
function whenWords(f: BoundFormat, iso: string, today: string): string {
  const day = dayOf(f, iso)
  if (day === today) return "today"
  if (day === addDays(today, -1)) return "yesterday"
  return `on ${dayWords(f, day, today)}`
}

/** The words of an overlap (TS 6.8): seasons in a show of the other rule, shows with its seasons, or the same titles. */
function overlapWords(footer: Extract<RuleFooter, { kind: "overlap" }>, level: RuleCardData["level"], f: BoundFormat): string {
  const { count, rule } = footer
  const n = f.number(count)
  const one = count === 1
  switch (footer.overlap) {
    case "inShow":
      return `${n} ${one ? "season is in a show" : "seasons are in shows"} that ${rule.name} also matches. A show never goes before its seasons.`
    case "hasSeasons":
      return `${n} ${one ? "show has seasons" : "shows have seasons"} that ${rule.name} also matches. A show never goes before its seasons.`
    case "same":
      return `${n} ${nounWord(count, level)} ${one ? "is" : "are"} also matched by ${rule.name}. A title that two rules match is in Leaving soon once, with the longer grace period.`
  }
}

/** The footer line of a card: its mark, words and an optional action. */
function lineOf(card: RuleCardData, f: BoundFormat, today: string): { mark?: ReactNode; text: string; history?: boolean } | null {
  const { footer } = card
  if (!footer) return card.mode === "dryRun" && card.facts.dryRuns.count === 0 ? { text: `${NO_DRY_RUN}.` } : null
  switch (footer.kind) {
    case "block": {
      const cause = blockCause(footer.block, { service: (service) => SERVICE_NAMES[service], rule: () => card.name, time: (iso) => f.time(iso) })
      return { mark: <span className="size-2 rounded-full bg-destructive" />, text: `Runs of this rule change nothing: ${cause}` }
    }
    case "ready": {
      const { sinceDay } = card.facts.dryRuns
      const since = sinceDay ? ` since your change on ${dayWords(f, sinceDay, today)}` : ""
      const sources = footer.readAt ? `, and every source answered at ${f.time(footer.readAt)}` : ""
      const runs = `${f.number(footer.dryRuns)} steady ${footer.dryRuns === 1 ? "dry run" : "dry runs"}`
      return { mark: <Icon icon={icons.success} className="text-success" />, text: `Ready to turn on: ${runs}${since}${sources}.` }
    }
    case "overlap":
      return { mark: <Icon icon={icons.info} className="text-info" />, text: overlapWords(footer, card.level, f), history: true }
    case "rescue":
      return { text: `Rescued ${whenWords(f, footer.at, today)}: ${footer.title}. ${footer.reason}` }
  }
}

/**
 * The one footer line of a rule card (UX 4.1.3 item 5), the first that
 * applies: a safety stop of the rule, "Ready to turn on" for a steady Dry
 * run, an overlap with another rule with "Open history", or the newest
 * rescue. A Dry run rule with none of these says that no dry run of this
 * version ran yet. Nothing renders when no line applies.
 */
export function RuleCardFooter({ card, today }: { card: RuleCardData; today: string }) {
  const f = useFormat()
  const line = lineOf(card, f, today)
  if (!line) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3" data-testid={`admin-cleanup-rule-${card.id}-footer`}>
      <p className="flex min-w-0 flex-1 items-start gap-2 text-ui text-muted-foreground">
        {line.mark && (
          <span aria-hidden="true" className="flex h-5 shrink-0 items-center">
            {line.mark}
          </span>
        )}
        <span>{line.text}</span>
      </p>
      {line.history && (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={cleanup({ tab: "history" })} />}
          aria-label={`Open history: ${card.name}`}
          data-testid={`admin-cleanup-rule-${card.id}-history`}
        >
          Open history
        </Button>
      )}
    </div>
  )
}
