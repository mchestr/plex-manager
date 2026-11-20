import Link from "next/link"
import { type ReactNode, Suspense } from "react"

import { DataItemList } from "@/components/account/data-item-list"
import { KeepsTable } from "@/components/account/keeps-table"
import { MarksTable } from "@/components/account/marks-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { getMyKeeps } from "@/lib/data/leaving-soon"
import { getSession } from "@/lib/data/session"
import { LIST_LIMIT, MARKS_PAGE_SIZE, type YourData } from "@/lib/member/your-data"

function Part({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-h3 text-foreground">{title}</h3>
        {note && <p className="text-label text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** "Showing the newest 50 of 80" when a list is cut short. */
function newest(total: number): string | undefined {
  return total > LIST_LIMIT ? `Showing the newest ${LIST_LIMIT} of ${total}.` : undefined
}

/**
 * Keeps (UX 9.4): the member's Keeps from Leaving soon, above Marks. It shows
 * while members can keep titles: media cleanup is on and not paused, and
 * its member options allow the page and Keeps. Otherwise it shows only to a
 * member with an active Keep, which still protects its title (TS E30).
 *
 * @internal Exported for the tests.
 */
export async function AccountKeeps() {
  // The page's own session read (React `cache`): it resolved before this section rendered
  const userId = (await getSession())?.user?.id
  if (!userId) return null
  const [{ keeps, myKeeps }, settings] = await Promise.all([getMyKeeps(userId), readCleanupSettingsRow()])
  const canKeep = isLive(settings) && settings.options.members.pageEnabled && keeps.enabled
  if (!canKeep && keeps.used === 0) return null
  return (
    <Part title="Keeps">
      <KeepsTable rows={myKeeps} limit={keeps.limit} />
    </Part>
  )
}

interface YourDataSectionProps {
  data: YourData
  /** What admins can see, with the assistant disclosure (P11.16). */
  disclosure: string
}

/**
 * The account page's "Your data" (P11.15, GAP-36): Keeps from Leaving soon
 * (UX 9.4) in their own boundary, then marks and watchlist history the
 * member can delete one by one. Share links and hidden titles keep their own
 * controls on the Rewind.
 */
export function YourDataSection({ data, disclosure }: YourDataSectionProps) {
  return (
    <Card data-testid="account-your-data" id="your-data" className="scroll-mt-20">
      <CardHeader>
        <CardTitle as="h2">Your data</CardTitle>
        <CardDescription>{disclosure}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <Suspense fallback={null}>
          <AccountKeeps />
        </Suspense>
        <Part title="Marks">
          <MarksTable rows={data.marks.rows} page={data.marks.page} pageSize={MARKS_PAGE_SIZE} total={data.marks.total} />
        </Part>
        <Part title="Watchlist history" note={newest(data.watchlist.total)}>
          <DataItemList items={data.watchlist.rows} empty="No watchlist items synced yet." data-testid="account-watchlist" />
        </Part>
        <p className="text-ui text-muted-foreground">
          Manage share links and hidden titles on{" "}
          <Link href="/rewind" className="text-foreground underline underline-offset-3" data-testid="account-rewind-link">
            your Rewind
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  )
}
