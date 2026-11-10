"use client"

import { KeepButton } from "@/components/leaving-soon/keep-button"
import { type CardKeep, LeaveLine, memberTypeLine } from "@/components/leaving-soon/leaving-card"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import { titleName } from "@/lib/cleanup/actions/keeps/words"
import { testIdKey } from "@/lib/cleanup/identity/keys"
import { REASON_LINES, reasonFact } from "@/lib/cleanup/member/reasons"
import type { ForYouItem } from "@/lib/cleanup/types/member"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"

const BASE = "leaving-soon-for-you"

function ForYouCard({ entry, keep }: { entry: ForYouItem; keep: CardKeep | null }) {
  const f = useFormat()
  const { item } = entry
  const name = titleName(item)
  const base = `${BASE}-${testIdKey(item.itemKey)}`
  return (
    <Card className="h-full flex-row gap-4 p-4" data-testid={base}>
      {/* The pattern of components/guides/requests-illustration.tsx: a fixed width inside the sm box */}
      <Poster ratingKey={item.posterKey} title={name} size="sm" decorative style={{ width: 88 }} />
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <p className="text-ui font-semibold text-foreground wrap-anywhere">{name}</p>
          <p className="text-label text-muted-foreground">{memberTypeLine(item)}</p>
        </div>
        <p className="flex items-center gap-1.5 text-label text-info" data-testid={`${base}-reason`}>
          <Icon icon={icons.info} size={14} />
          {REASON_LINES[entry.reason]}
        </p>
        <p className="text-caption text-muted-foreground">{reasonFact(entry.reason, entry.reasonAt, f.settings)}</p>
        <LeaveLine leaveAt={entry.leaveAt} />
        <KeepButton itemKey={item.itemKey} title={name} testIdBase={base} keep={keep} className="mt-1" />
      </div>
    </Card>
  )
}

interface ForYouGridProps {
  items: readonly ForYouItem[]
  /** The member's active Keeps by item key. */
  keeps: ReadonlyMap<string, CardKeep>
}

/**
 * For you (UX 9.2, 9.2.3): the titles that the member requested, started,
 * played or put on their watchlist, each with its reason line in `info` and
 * the dated fact. Three columns from `md`, one below. Only the member sees
 * these reasons.
 */
export function ForYouGrid({ items, keeps }: ForYouGridProps) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby={`${BASE}-title`} className="flex flex-col gap-3" data-testid={BASE}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`${BASE}-title`} className="text-h2 text-foreground">
          For you
        </h2>
        <p className="text-label text-muted-foreground">You requested these or played them before. Only you see this list.</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((entry) => (
          <li key={entry.item.itemKey}>
            <ForYouCard entry={entry} keep={keeps.get(entry.item.itemKey) ?? null} />
          </li>
        ))}
      </ul>
    </section>
  )
}
