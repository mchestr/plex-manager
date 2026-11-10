import Link from "next/link"

import { KeepButton, KeepsProvider } from "@/components/leaving-soon/keep-button"
import { LeaveLine } from "@/components/leaving-soon/leaving-card"
import { Button } from "@/components/ui/button"
import { Poster } from "@/components/ui/poster"
import { Skeleton } from "@/components/ui/skeleton"
import { titleName } from "@/lib/cleanup/actions/keeps/words"
import { testIdKey } from "@/lib/cleanup/identity/keys"
import type { LeavingSoonRowData, MemberLeavingSoonData } from "@/lib/cleanup/types/member"
import { getLeavingSoonForMember, getLeavingSoonRow } from "@/lib/data/leaving-soon"
import { formatNumber, type FormatSettings } from "@/lib/utils/format"

interface LeavingSoonRowProps {
  userId: string
  serverName: string
  format: FormatSettings
}

// As the New on row: `relative` makes the row clip the sr-only text of its items
const ROW_CLASS = "relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
const ITEM_CLASS = "flex w-40 shrink-0 snap-start flex-col gap-2"
const BASE = "home-leaving-soon"

/**
 * "{N} titles leave soon. The {k} for you come first. Keep one to watch it
 * later." (UX 9.3). Without member Keeps, the last sentence goes.
 * @internal Exported for the tests.
 */
export function rowCaption(row: Pick<LeavingSoonRowData, "total" | "forYouCount">, keepsOn: boolean, format: FormatSettings): string {
  const total = row.total === 1 ? "1 title leaves soon." : `${formatNumber(row.total, format)} titles leave soon.`
  const forYou = row.forYouCount === 0 ? "" : row.forYouCount === 1 ? " The 1 for you comes first." : ` The ${formatNumber(row.forYouCount, format)} for you come first.`
  return `${total}${forYou}${keepsOn ? " Keep one to watch it later." : ""}`
}

/** The member's active Keep of each title, so a kept title shows "Kept by you" and End keep. */
function keepOf(data: MemberLeavingSoonData, itemKey: string) {
  const row = data.myKeeps.find((keep) => keep.endedBy === undefined && keep.item.itemKey === itemKey)
  return row ? { keepId: row.id, until: row.until } : null
}

/**
 * "Leaving soon on {server}" (UX 9.3): up to 12 titles that leave soon, For
 * you first, as a poster row that scrolls sideways, each with Keep. A Keep
 * shows "Kept by you" and End keep at once, with the Undo toast; at the Keep
 * limit Keep is disabled and names the reason. It follows the member's
 * Leaving soon value (TS 13.1): it renders nothing when there is no title,
 * or plex.tv did not answer. Home streams it behind {@link LeavingSoonRowSkeleton}.
 */
export async function LeavingSoonRow({ userId, serverName, format }: LeavingSoonRowProps) {
  // Both read the same cached member data (lib/data/leaving-soon.ts): the page data adds the Keep meter
  const [row, data] = await Promise.all([getLeavingSoonRow(userId), getLeavingSoonForMember(userId)])
  if (row.items.length === 0) return null

  return (
    <KeepsProvider keeps={data.keeps}>
      <section aria-labelledby={`${BASE}-title`} className="flex min-w-0 flex-col gap-3.5" data-testid={`${BASE}-row`}>
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 id={`${BASE}-title`} className="text-lead font-semibold text-foreground wrap-anywhere">
              Leaving soon on {serverName}
            </h2>
            <p className="text-caption text-muted-foreground">{rowCaption(row, data.keeps.enabled, format)}</p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" nativeButton={false} render={<Link href="/leaving-soon" />} data-testid={`${BASE}-see-all`}>
            See all
          </Button>
        </div>
        <ul className={ROW_CLASS} data-testid={`${BASE}-list`}>
          {row.items.map(({ item, leaveAt }) => {
            const name = titleName(item)
            const base = `${BASE}-item-${testIdKey(item.itemKey)}`
            return (
              <li key={item.itemKey} className={ITEM_CLASS} data-testid={base}>
                <Poster ratingKey={item.posterKey} title={name} size="md" decorative />
                <span className="flex flex-col gap-0.5">
                  <span className="line-clamp-2 text-label text-foreground wrap-anywhere">{name}</span>
                  <LeaveLine leaveAt={leaveAt} className="text-caption" />
                </span>
                <KeepButton itemKey={item.itemKey} title={name} testIdBase={base} keep={keepOf(data, item.itemKey)} size="sm" className="mt-auto" />
              </li>
            )
          })}
        </ul>
      </section>
    </KeepsProvider>
  )
}

/** The row while the member's Leaving soon answers: the heading and a few poster boxes. */
export function LeavingSoonRowSkeleton() {
  return (
    <div role="status" className="flex min-w-0 flex-col gap-3.5" data-testid={`${BASE}-skeleton`}>
      <span className="sr-only">Loading titles that leave soon</span>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="flex gap-4 overflow-hidden pb-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex w-40 shrink-0 flex-col gap-2">
            <Skeleton className="aspect-[2/3] w-40 rounded-sm" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-40" />
          </div>
        ))}
      </div>
    </div>
  )
}
