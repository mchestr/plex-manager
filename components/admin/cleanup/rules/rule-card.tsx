"use client"

import Link from "next/link"
import { useId } from "react"

import { WhyText } from "@/components/admin/cleanup/results/why-text"
import { RuleCardFacts } from "@/components/admin/cleanup/rules/rule-card-facts"
import { RuleCardFooter } from "@/components/admin/cleanup/rules/rule-card-footer"
import { RuleCardMenu } from "@/components/admin/cleanup/rules/rule-card-menu"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Poster } from "@/components/ui/poster"
import { StatusBadge } from "@/components/ui/status-badge"
import { cleanup, cleanupRule, cleanupTurnOn } from "@/lib/admin/routes"
import type { RuleCardData } from "@/lib/cleanup/types/rule-parts"

/** The reason of a disabled "Turn on..." (UX 4.1.4, TS 9.5 item 4). */
const TURN_ON_REDIS_REASON = "Redis is not set up."

interface RuleCardProps {
  card: RuleCardData
  /** The job queue is set up: "Turn on..." and "Run dry run now" need it. */
  redis: boolean
  /** Today in the server zone, a day key. */
  today: string
}

/** The next step of the header (UX 4.1.3 item 2): "Turn on..." for a Dry run rule, "Review the batch" for a live rule with a waiting batch. */
function NextStep({ card, redis }: Omit<RuleCardProps, "today">) {
  const reasonId = useId()
  const id = `admin-cleanup-rule-${card.id}`
  if (card.mode === "dryRun") {
    const label = `Turn on ${card.name}`
    if (!redis) {
      return (
        <>
          <Button variant="secondary" size="sm" disabled focusableWhenDisabled aria-label={label} aria-describedby={reasonId} data-testid={`${id}-turn-on`}>
            Turn on...
          </Button>
          <span id={reasonId} className="sr-only">
            {TURN_ON_REDIS_REASON}
          </span>
        </>
      )
    }
    return (
      <Button variant="secondary" size="sm" nativeButton={false} render={<Link href={cleanupTurnOn(card.id)} />} aria-label={label} data-testid={`${id}-turn-on`}>
        Turn on...
      </Button>
    )
  }
  if (!card.waitingBatch) return null
  return (
    <Button
      size="sm"
      nativeButton={false}
      render={<Link href={cleanup({ tab: "leaving-soon" })} />}
      aria-label={`Review the batch: ${card.name}`}
      data-testid={`${id}-review`}
    >
      Review the batch
    </Button>
  )
}

/**
 * One rule of the Rules tab (UX 4.1.3): the name, the mode badge and the
 * rule as a sentence with its values in bold; the next step, Edit and the
 * rule menu; the four largest matches, a divider and the facts of its mode;
 * and the footer line. Below `md` the posters sit above the facts.
 */
export function RuleCard({ card, redis, today }: RuleCardProps) {
  const id = `admin-cleanup-rule-${card.id}`
  return (
    <Card className="overflow-hidden" data-testid={id}>
      <div className="flex flex-col gap-2 px-5 pt-4 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1">
            <h3 className="text-h3 text-foreground">
              {card.name}
            </h3>
            <StatusBadge domain="cleanupMode" value={card.mode} data-testid={`${id}-mode`} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NextStep card={card} redis={redis} />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={cleanupRule(card.id)} />} aria-label={`Edit ${card.name}`} data-testid={`${id}-edit`}>
              Edit
            </Button>
            <RuleCardMenu
              variant="card"
              rule={{ id: card.id, name: card.name, level: card.level, mode: card.mode }}
              leavingCount={card.facts.leaving?.count ?? 0}
              redis={redis}
            />
          </div>
        </div>
        <p className="max-w-[80ch] text-ui" data-testid={`${id}-sentence`}>
          <WhyText parts={card.sentence} />
        </p>
      </div>
      <div className="flex flex-col gap-4 px-5 pb-5 md:flex-row md:items-center md:gap-6">
        {card.posters.length > 0 && (
          <>
            <div aria-hidden="true" className="flex shrink-0 gap-2" data-testid={`${id}-posters`}>
              {card.posters.map((ratingKey) => (
                <Poster key={ratingKey} ratingKey={ratingKey} title="" size="xs" decorative />
              ))}
            </div>
            <div aria-hidden="true" className="hidden w-px self-stretch bg-border md:block" />
          </>
        )}
        <RuleCardFacts card={card} today={today} />
      </div>
      <RuleCardFooter card={card} today={today} />
    </Card>
  )
}
