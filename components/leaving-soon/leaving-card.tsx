"use client"

import { KeepButton } from "@/components/leaving-soon/keep-button"
import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import { titleName } from "@/lib/cleanup/actions/keeps/words"
import { testIdKey } from "@/lib/cleanup/identity/keys"
import { plural } from "@/lib/cleanup/action-words"
import type { MemberLeaveAt } from "@/lib/cleanup/types/member"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** The member's own Keep of a title, for a card that shows "Kept by you". */
export type CardKeep = { keepId: string; until: string }

/**
 * The type line under a member's title (UX 9.2): "Movie, 2009", "Show, 4
 * seasons", or the episodes of a season ("22 episodes"). No size.
 */
export function memberTypeLine(item: Pick<ItemRef, "level" | "year" | "seasonCount" | "episodeCount">): string {
  if (item.level === "movie") return item.year ? `Movie, ${item.year}` : "Movie"
  if (item.level === "show") return item.seasonCount ? `Show, ${plural(item.seasonCount, "season")}` : "Show"
  if (item.episodeCount === null) return "Season"
  return `${item.episodeCount} ${item.episodeCount === 1 ? "episode" : "episodes"}`
}

/**
 * The leave line with the calendar icon: "Leaves Nov 19", or "Leaves any day
 * now" in `warning` for a title that reached its leave date (UX 9.2).
 */
export function LeaveLine({ leaveAt, className }: { leaveAt: MemberLeaveAt; className?: string }) {
  const f = useFormat()
  const due = leaveAt === "due"
  return (
    <p className={cn("flex items-center gap-1.5 text-label", due ? "text-warning" : "text-muted-foreground", className)}>
      <Icon icon={icons.scheduled} size={14} />
      {due ? "Leaves any day now" : `Leaves ${f.dayKey(leaveAt, "day-month-short")}`}
    </p>
  )
}

interface LeavingCardProps {
  item: ItemRef
  leaveAt: MemberLeaveAt
  /** The member's Keep of the title, when the page knows one. */
  keep: CardKeep | null
}

/**
 * One title of a date group (UX 9.2): a fluid `Poster` md, the title and its
 * type line, the leave line, and Keep, named "Keep {title}". The card takes
 * focus from "Show all" (`tabIndex={-1}`).
 */
export function LeavingCard({ item, leaveAt, keep }: LeavingCardProps) {
  const name = titleName(item)
  const base = `leaving-soon-card-${testIdKey(item.itemKey)}`
  return (
    <article
      tabIndex={-1}
      aria-label={name}
      className="flex h-full flex-col gap-2 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      data-testid={base}
    >
      <Poster ratingKey={item.posterKey} title={name} size="md" decorative style={{ width: "100%" }} />
      <div className="flex flex-col gap-0.5">
        <p className="line-clamp-2 text-ui font-semibold text-foreground wrap-anywhere">{name}</p>
        <p className="text-label text-muted-foreground">{memberTypeLine(item)}</p>
      </div>
      <LeaveLine leaveAt={leaveAt} />
      <KeepButton itemKey={item.itemKey} title={name} testIdBase={base} keep={keep} className="mt-auto" />
    </article>
  )
}
