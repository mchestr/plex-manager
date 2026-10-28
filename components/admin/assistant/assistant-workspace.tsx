"use client"

import Link from "next/link"
import { useRef, useState } from "react"

import { AssistantComposer } from "@/components/admin/assistant/assistant-composer"
import { AssistantHistory } from "@/components/admin/assistant/assistant-history"
import { AssistantTranscript } from "@/components/admin/assistant/assistant-transcript"
import { AssistantWelcome } from "@/components/admin/assistant/assistant-welcome"
import { useAssistantChat } from "@/components/admin/assistant/use-assistant-chat"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { assistant, settingsSection } from "@/lib/admin/routes"
import type { AssistantConversation, AssistantHistoryItem } from "@/lib/chatbot/types"
import { icons } from "@/lib/ui/icons"

/** Why nothing can be sent, and who can change that. */
function Unavailable({ canConfigure }: { canConfigure: boolean }) {
  return (
    <Alert
      title="The assistant is off"
      action={
        canConfigure && (
          <Button variant="outline" size="sm" render={<Link href={settingsSection("ai")} />} nativeButton={false} data-testid="admin-chat-open-settings">
            Open AI settings
          </Button>
        )
      }
      data-testid="admin-chat-unavailable"
    >
      {canConfigure
        ? "Turn on AI features and choose a chat model in Settings. Past conversations stay readable."
        : "An admin needs to turn on AI features and choose a chat model. Past conversations stay readable."}
    </Alert>
  )
}

interface AssistantWorkspaceProps {
  /** AI features are on and a chat model is active. */
  available: boolean
  disclosure: string
  usageTextDays: number
  historyDays: number
  history: AssistantHistoryItem[]
  conversation: AssistantConversation | null
  /** The server's render time, for the history's date groups. */
  now: number
  /** An admin can turn the assistant on in Settings; a role has to ask one. */
  canConfigure: boolean
}

/**
 * The assistant page: the history beside the conversation from `lg`, in a
 * sheet below it. The page fills the screen under the shell's chrome and
 * scrolls inside, so the message box stays at the bottom.
 */
export function AssistantWorkspace({
  available,
  disclosure,
  usageTextDays,
  historyDays,
  history,
  conversation,
  now,
  canConfigure,
}: AssistantWorkspaceProps) {
  const chat = useAssistantChat(conversation)
  const [historyOpen, setHistoryOpen] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)
  const historyProps = { items: history, activeId: chat.id, now, usageTextDays, historyDays }

  const ask = (question: string) => {
    // The suggestion leaves with the welcome, so focus moves to the message box
    composer.current?.focus()
    void chat.send(question)
  }

  return (
    // Below `md` the shell's 56px top bar and main's tab-bar padding (4rem and the safe area) take the rest of
    // the screen; from `md` the page takes all of it, over main's 24px bottom padding
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:-mb-6 md:h-dvh" data-testid="admin-assistant-page">
      <div className="hidden w-64 shrink-0 flex-col border-r border-border p-3 lg:flex xl:w-72">
        <AssistantHistory {...historyProps} testId="admin-assistant-history" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 md:px-6">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="-ml-2 lg:hidden" data-testid="admin-assistant-history-open" />}>
              <Icon icon={icons.conversationHistory} size={20} />
              <span className="sr-only">History</span>
            </SheetTrigger>
            <SheetContent side="right" data-testid="admin-assistant-history-sheet">
              <SheetHeader>
                <SheetTitle>History</SheetTitle>
              </SheetHeader>
              <AssistantHistory {...historyProps} testId="admin-assistant-history-mobile" onNavigate={() => setHistoryOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="min-w-0 flex-1 truncate text-h3" data-testid="admin-assistant-title">
            {conversation?.title ?? "Assistant"}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 lg:hidden"
            render={<Link href={assistant()} />}
            nativeButton={false}
            aria-label="New conversation"
            data-testid="admin-assistant-new-mobile"
          >
            <Icon icon={icons.newConversation} size={20} />
          </Button>
        </header>
        <AssistantTranscript
          messages={chat.messages}
          pending={chat.pending}
          session={chat.session}
          empty={<AssistantWelcome suggest={available} onPick={ask} />}
        />
        <div className="shrink-0 px-4 pb-4 md:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {chat.error && (
              <Alert tone="destructive" data-testid="admin-chat-error">
                {chat.error}
              </Alert>
            )}
            {!available && <Unavailable canConfigure={canConfigure} />}
            <AssistantComposer ref={composer} pending={chat.pending} disabled={!available} onSend={chat.send} />
            <p className="text-center text-caption text-muted-foreground" data-testid="admin-chat-disclosure">
              {disclosure}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
