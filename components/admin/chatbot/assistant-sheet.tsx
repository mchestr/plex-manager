"use client"

import type { ComponentProps, MouseEvent } from "react"

import { AssistantTranscript } from "@/components/admin/chatbot/assistant-transcript"
import { useChat } from "@/components/admin/chatbot/chat-context"
import { useAssistantChat } from "@/components/admin/chatbot/use-assistant-chat"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { icons } from "@/lib/ui/icons"

/**
 * The admin assistant (UI-04, ui-design-system 6.2): a 420px right Sheet that
 * fills the screen below `md`. It is a dialog labelled "Assistant" with a
 * close button; Escape closes it too, and focus returns to the trigger that
 * opened it. Nothing floats over the page while it is closed.
 *
 * The sheet stays mounted while closed, so the conversation survives a close.
 */
export function AssistantSheet({ userName }: { userName?: string }) {
  const { isOpen, setOpen, returnFocus } = useChat()
  const { messages, isLoading, send, reset } = useAssistantChat(userName)

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={false}
        finalFocus={returnFocus}
        className="gap-0 p-0 md:border-l"
        data-testid="admin-chat-sheet"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 md:px-6">
          <SheetTitle className="text-body">Assistant</SheetTitle>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
            New conversation
          </Button>
          <SheetClose
            render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" data-testid="admin-chat-close" />}
          >
            <Icon icon={icons.close} />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
        <AssistantTranscript messages={messages} isLoading={isLoading} onSend={send} />
      </SheetContent>
    </Sheet>
  )
}

interface TriggerProps extends Omit<ComponentProps<"button">, "color" | "className" | "onClick" | "aria-expanded"> {
  size?: "default" | "icon"
  className?: string
  "data-testid": string
  /** Merged in by a Tooltip trigger that renders this button. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

/** A button that opens and closes the assistant sheet, with `aria-expanded`. */
export function AssistantTrigger({ children, onClick, ...props }: TriggerProps) {
  const { isOpen, toggleFrom } = useChat()
  return (
    <Button
      variant="ghost"
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      {...props}
      onClick={(event) => {
        onClick?.(event)
        toggleFrom(event.currentTarget)
      }}
    >
      {children}
    </Button>
  )
}
