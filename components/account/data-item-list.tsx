"use client"

import { Trash2 } from "lucide-react"

import { deleteMyConversation, forgetWatchlistItem } from "@/actions/member-data"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { Time } from "@/components/ui/time"
import { useToast } from "@/components/ui/toast"
import type { DataItem } from "@/lib/member/your-data"

type Kind = "watchlist" | "conversation"

const COPY: Record<
  Kind,
  { verb: string; pending: string; done: string; testId: string; title: (item: DataItem) => string; description: string }
> = {
  watchlist: {
    verb: "Forget",
    pending: "Forgetting",
    done: "Item forgotten",
    testId: "account-watchlist-forget",
    title: (item) => `Forget ${item.title}?`,
    description: "It leaves your watchlist history. If it is still on your Plex watchlist, the next sync can request it again.",
  },
  conversation: {
    verb: "Delete",
    pending: "Deleting",
    done: "Conversation deleted",
    testId: "account-conversation-delete",
    title: () => "Delete this conversation?",
    description: "Its messages are deleted. The record of what it cost the server stays, without any text.",
  },
}

function remove(kind: Kind, id: string) {
  return kind === "watchlist" ? forgetWatchlistItem({ historyId: id }) : deleteMyConversation({ conversationId: id })
}

interface DataItemListProps {
  kind: Kind
  items: DataItem[]
  /** Read when the list is empty. */
  empty: string
  "data-testid": string
}

/** Watchlist history or assistant conversations, newest first, each with its own confirm (P11.15). */
export function DataItemList({ kind, items, empty, "data-testid": testId }: DataItemListProps) {
  const toast = useToast()
  const copy = COPY[kind]

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
              <Button variant="ghost" size="sm" data-testid={`${copy.testId}-${item.id}`}>
                <Icon icon={Trash2} />
                {copy.verb}
              </Button>
            }
            title={copy.title(item)}
            description={copy.description}
            confirmLabel={copy.verb}
            pendingLabel={copy.pending}
            tone="destructive"
            action={async () => {
              const result = await remove(kind, item.id)
              if (!result.success) return { error: result.error }
              toast.showSuccess(copy.done)
              return {}
            }}
            data-testid={`${copy.testId}-dialog`}
            confirmTestId={`${copy.testId}-confirm`}
          />
        </li>
      ))}
    </ul>
  )
}
