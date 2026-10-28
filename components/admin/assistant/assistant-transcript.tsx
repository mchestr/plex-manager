"use client"

import { useEffect, useRef, type ReactNode } from "react"

import type { ChatMessage } from "@/lib/chatbot/types"
import { Badge } from "@/components/ui/badge"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { Spinner } from "@/components/ui/spinner"
import { useBrowserFormat } from "@/lib/format-context"

/** `get_sonarr_status` reads "Get Sonarr Status". */
function toolName(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Question({ message }: { message: ChatMessage }) {
  // The viewer's own clock, as the assistant's answers use it
  const f = useBrowserFormat()
  return (
    <div className="flex flex-col items-end gap-1" data-testid="admin-chat-question">
      <div className="max-w-[85%] rounded-lg border border-border-strong bg-secondary px-4 py-2 text-ui whitespace-pre-wrap break-words text-secondary-foreground">
        <span className="sr-only">You: </span>
        {message.content}
      </div>
      <span className="text-caption text-muted-foreground">{f.time(message.timestamp)}</span>
    </div>
  )
}

function Answer({ message }: { message: ChatMessage }) {
  const f = useBrowserFormat()
  return (
    <div className="flex flex-col gap-2" data-testid="admin-chat-answer">
      <span className="sr-only">Assistant:</span>
      <MarkdownBody className="break-words [--typeset-flow:0.75em] [--typeset-leading:1.6]">{message.content}</MarkdownBody>
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">Sources</span>
          {message.sources.map((source, i) => (
            <Badge key={`${source.tool}-${i}`} variant="outline" title={source.description}>
              {toolName(source.tool)}
            </Badge>
          ))}
        </div>
      )}
      <span className="text-caption text-muted-foreground">{f.time(message.timestamp)}</span>
    </div>
  )
}

interface AssistantTranscriptProps {
  messages: ChatMessage[]
  pending: boolean
  /** Changes when another conversation opens, so the log starts over rather than announcing every old message. */
  session: number
  /** What an empty conversation shows. */
  empty: ReactNode
}

/**
 * The conversation (`role="log"`): questions on the right, answers as Markdown
 * at reading width with the tools they used. It scrolls on its own, keeping
 * the newest message in view.
 */
export function AssistantTranscript({ messages, pending, session, empty }: AssistantTranscriptProps) {
  const logRef = useRef<HTMLDivElement>(null)

  // A real effect: the transcript keeps its newest message in view. It scrolls
  // the log itself: scrollIntoView would also move where the next Tab starts
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, pending])

  return (
    <div
      key={session}
      ref={logRef}
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      aria-busy={pending}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-6"
      data-testid="admin-chat-log"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 py-6">
        {messages.length === 0 && !pending
          ? empty
          : messages.map((message, index) =>
              message.role === "user" ? (
                <Question key={`${message.timestamp}-${index}`} message={message} />
              ) : (
                <Answer key={`${message.timestamp}-${index}`} message={message} />
              )
            )}
        {pending && (
          <div className="flex items-center gap-2 text-ui text-muted-foreground" data-testid="admin-chat-thinking">
            <Spinner />
            Thinking…
          </div>
        )}
      </div>
    </div>
  )
}
