import Link from "next/link"
import type { ReactNode } from "react"

import { DataItemList } from "@/components/account/data-item-list"
import { MarksTable } from "@/components/account/marks-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
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

interface YourDataSectionProps {
  data: YourData
  /** What admins can see, with the assistant disclosure (P11.16). */
  disclosure: string
}

/**
 * The account page's "Your data" (P11.15, GAP-36): marks and watchlist history
 * the member can delete one by one, and their problem reports, read-only. Share links and hidden titles keep their own controls on the
 * Rewind.
 */
export function YourDataSection({ data, disclosure }: YourDataSectionProps) {
  return (
    <Card data-testid="account-your-data" id="your-data" className="scroll-mt-20">
      <CardHeader>
        <CardTitle as="h2">Your data</CardTitle>
        <CardDescription>{disclosure}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <Part title="Marks">
          <MarksTable rows={data.marks.rows} page={data.marks.page} pageSize={MARKS_PAGE_SIZE} total={data.marks.total} />
        </Part>
        <Part title="Watchlist history" note={newest(data.watchlist.total)}>
          <DataItemList items={data.watchlist.rows} empty="No watchlist items synced yet." data-testid="account-watchlist" />
        </Part>
        {data.reports.total > 0 && (
          <Part title="Problem reports" note={newest(data.reports.total)}>
            <ul className="divide-y divide-border" data-testid="account-reports">
              {data.reports.rows.map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-4 py-2" data-testid={`account-reports-row-${report.id}`}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-ui text-foreground">{report.title}</span>
                    <Time value={report.at} className="text-label text-muted-foreground" />
                  </div>
                  <StatusBadge domain="problemReport" value={report.status} />
                </li>
              ))}
            </ul>
          </Part>
        )}
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
