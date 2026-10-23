import { Download } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { DataItemList } from "@/components/account/data-item-list"
import { MarksTable } from "@/components/account/marks-table"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
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
 * The account page's "Your data" (P11.15, GAP-36): the JSON download, and
 * marks, watchlist history and assistant conversations the member can delete
 * one by one. Share links and hidden titles keep their own controls on the
 * Rewind.
 */
export function YourDataSection({ data, disclosure }: YourDataSectionProps) {
  return (
    <Card data-testid="account-your-data" id="your-data" className="scroll-mt-20">
      <CardHeader>
        <CardTitle as="h2">Your data</CardTitle>
        <CardDescription>{disclosure}</CardDescription>
        <CardAction>
          <Button variant="secondary" size="sm" nativeButton={false} render={<a href="/account/export" download aria-label="Download my data" />} data-testid="account-export-button">
            <Icon icon={Download} />
            Download my data
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <Part title="Marks">
          <MarksTable rows={data.marks.rows} page={data.marks.page} pageSize={MARKS_PAGE_SIZE} total={data.marks.total} />
        </Part>
        <Part title="Watchlist history" note={newest(data.watchlist.total)}>
          <DataItemList kind="watchlist" items={data.watchlist.rows} empty="No watchlist items synced yet." data-testid="account-watchlist" />
        </Part>
        <Part title="Assistant conversations" note={newest(data.conversations.total)}>
          <DataItemList
            kind="conversation"
            items={data.conversations.rows}
            empty="No conversations with the assistant."
            data-testid="account-conversations"
          />
        </Part>
        <p className="text-ui text-muted-foreground">
          Share links and hidden titles are managed on{" "}
          <Link href="/rewind" className="text-foreground underline underline-offset-3" data-testid="account-rewind-link">
            your Rewind
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  )
}
