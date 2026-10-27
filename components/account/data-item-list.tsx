"use client"

import { Trash2 } from "lucide-react"

import { forgetWatchlistItem } from "@/actions/member-data"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { DataItem } from "@/lib/member/your-data"

interface DataItemListProps {
  items: DataItem[]
  /** Read when the list is empty. */
  empty: string
  "data-testid": string
}

/** Watchlist history, newest first, each item with its own forget confirm (P11.15). */
export function DataItemList({ items, empty, "data-testid": testId }: DataItemListProps) {
  const toast = useToast()

  if (items.length === 0) {
    return (
      <p className="text-ui text-muted-foreground" data-testid={`${testId}-empty`}>
        {empty}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border" data-testid={testId}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-4 py-2" data-testid={`${testId}-row-${item.id}`}>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-ui text-foreground">{item.title}</span>
            <Time value={item.at} className="text-label text-muted-foreground" />
          </div>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" data-testid={`account-watchlist-forget-${item.id}`}>
                <Icon icon={Trash2} />
                Forget
              </Button>
            }
            title={`Forget ${item.title}?`}
            description="It leaves your watchlist history. If it is still on your Plex watchlist, the next sync can request it again."
            confirmLabel="Forget"
            pendingLabel="Forgetting"
            tone="destructive"
            action={async () => {
              const result = await forgetWatchlistItem({ historyId: item.id })
              if (!result.success) return { error: result.error }
              toast.showSuccess("Item forgotten")
              return {}
            }}
            data-testid="account-watchlist-forget-dialog"
            confirmTestId="account-watchlist-forget-confirm"
          />
        </li>
      ))}
    </ul>
  )
}
