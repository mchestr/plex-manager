"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, type RefObject } from "react"

import { deleteAssistantConversation } from "@/actions/chatbot"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { groupHistory } from "@/lib/admin/assistant-groups"
import { assistant } from "@/lib/admin/routes"
import type { AssistantHistoryItem } from "@/lib/chatbot/types"
import { useBrowserFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

interface RowProps {
  item: AssistantHistoryItem
  active: boolean
  usageTextDays: number
  testId: string
  /** Takes focus once the row is deleted, since its delete button goes with it. */
  afterDelete: RefObject<HTMLElement | null>
  onLeave: () => void
  onNavigate?: () => void
}

function Row({ item, active, usageTextDays, testId, afterDelete, onLeave, onNavigate }: RowProps) {
  const router = useRouter()
  const toast = useToast()

  return (
    <li className={cn("group flex items-center gap-1 rounded-md pr-1 hover:bg-accent", active && "bg-accent")}>
      <Link
        href={assistant(item.id)}
        onNavigate={active ? undefined : onLeave}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={item.title}
        className={cn(
          "min-w-0 flex-1 truncate rounded-md py-2 pl-3 text-ui text-muted-foreground group-hover:text-accent-foreground",
          active && "font-medium text-accent-foreground"
        )}
        data-testid={`${testId}-item-${item.id}`}
      >
        {item.title}
      </Link>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.title}`}
            className={cn(
              "shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
              active && "opacity-100"
            )}
            data-testid={`${testId}-delete-${item.id}`}
          >
            <Icon icon={icons.delete} />
          </Button>
        }
        title="Delete this conversation?"
        description={`“${item.title}” leaves your history and can't be restored. Admins can still read its messages on the LLM usage pages for up to ${usageTextDays} days after they were sent.`}
        confirmLabel="Delete"
        pendingLabel="Deleting"
        tone="destructive"
        // The open conversation's delete leaves its URL, and the page then moves focus to the title
        successFocus={active ? undefined : afterDelete}
        action={async () => {
          const result = await deleteAssistantConversation({ conversationId: item.id })
          // Already gone (deleted in another tab, or ended by the retention sweep) is what was asked for
          if (!result.success && result.code !== "NOT_FOUND") return { error: result.error }
          toast.showSuccess("Conversation deleted")
          // The action does not refresh: on the deleted conversation's own URL that would render it as not found first
          if (active) router.replace(assistant())
          else router.refresh()
          return {}
        }}
        data-testid="admin-assistant-delete-dialog"
        confirmTestId="admin-assistant-delete-confirm"
      />
    </li>
  )
}

interface AssistantHistoryProps {
  items: AssistantHistoryItem[]
  /** The list stops at its limit, so older conversations are not in it. */
  capped: boolean
  /** The conversation on screen. */
  activeId: string | null
  /** The server's render time, for the date groups. */
  now: number
  /** How long the LLM usage pages keep a deleted conversation's text, for the delete confirm. */
  usageTextDays: number
  /** How long a conversation stays in the history after its last message. */
  historyDays: number
  /** `admin-assistant-history` in the side panel, `admin-assistant-history-mobile` in the sheet. */
  testId: string
  /** Empties the transcript as "New conversation" navigates, so a reply on its way never lands in it. */
  onNew: () => void
  /** Drops a reply on its way as another conversation's link navigates. */
  onLeave: () => void
  /** Closes the sheet the list sits in. */
  onNavigate?: () => void
}

/**
 * The caller's conversations, newest first in date groups on the viewer's
 * clock, under "New conversation". Each one opens by its link and deletes
 * after a confirm.
 */
export function AssistantHistory({
  items,
  capped,
  activeId,
  now,
  usageTextDays,
  historyDays,
  testId,
  onNew,
  onLeave,
  onNavigate,
}: AssistantHistoryProps) {
  const f = useBrowserFormat()
  const groups = groupHistory(items, now, f.settings.timeZone)
  const newConversation = useRef<HTMLAnchorElement>(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button
        variant="outline"
        className="justify-start"
        icon={<Icon icon={icons.newConversation} />}
        render={<Link href={assistant()} ref={newConversation} onNavigate={onNew} />}
        nativeButton={false}
        onClick={onNavigate}
        data-testid={`${testId}-new`}
      >
        New conversation
      </Button>
      <nav aria-label="Conversation history" className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1" data-testid={testId}>
        {groups.length === 0 ? (
          <p className="px-3 py-2 text-ui text-muted-foreground" data-testid={`${testId}-empty`}>
            No conversations yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(({ group, items: grouped }) => (
              <div key={group} className="flex flex-col gap-1">
                <h2 className="px-3 text-caption font-medium text-muted-foreground">{group}</h2>
                <ul className="flex flex-col gap-1">
                  {grouped.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      active={item.id === activeId}
                      usageTextDays={usageTextDays}
                      testId={testId}
                      afterDelete={newConversation}
                      onLeave={onLeave}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </nav>
      <p className="px-3 text-caption text-muted-foreground" data-testid={`${testId}-window`}>
        {capped && `Showing your ${items.length} most recent conversations. `}
        Conversations leave this list {historyDays} {historyDays === 1 ? "day" : "days"} after their last message.
      </p>
    </div>
  )
}
