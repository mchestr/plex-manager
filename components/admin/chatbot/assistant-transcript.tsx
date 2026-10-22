"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"

import { type ChatMessage } from "@/actions/chatbot/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { Spinner } from "@/components/ui/spinner"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** `get_sonarr_status` reads "Get Sonarr Status". */
function toolName(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Message({ message }: { message: ChatMessage }) {
  const f = useFormat()
  const mine = message.role === "user"
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg border p-3 text-ui",
          mine ? "border-border-strong bg-secondary text-secondary-foreground" : "border-border bg-card text-card-foreground"
        )}
      >
        {mine ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <MarkdownBody className="[--typeset-flow:0.75em] [--typeset-leading:1.6]">{message.content}</MarkdownBody>
        )}
        {!mine && message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1.5 text-caption text-muted-foreground">Sources:</div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source, i) => (
                <Badge key={`${source.tool}-${i}`} variant="outline" title={source.description}>
                  {toolName(source.tool)}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="mt-1 text-caption text-muted-foreground">{f.time(message.timestamp)}</div>
      </div>
    </div>
  )
}

interface AssistantTranscriptProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSend: (text: string) => void
}

/** The transcript (`role="log"`) and the composer of the assistant sheet. */
export function AssistantTranscript({ messages, isLoading, onSend }: AssistantTranscriptProps) {
  const [input, setInput] = useState("")
  const inputId = useId()
  const endRef = useRef<HTMLDivElement>(null)

  // A real effect: the streamed transcript keeps its newest line in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim() || isLoading) return
    onSend(input)
    setInput("")
  }

  return (
    <>
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        aria-busy={isLoading}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6"
        data-testid="admin-chat-log"
      >
        {messages.map((message, index) => (
          <Message key={`${message.timestamp}-${index}`} message={message} />
        ))}
        {isLoading && (
          <div className="flex justify-start text-muted-foreground">
            <Spinner label="Thinking" />
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border px-4 py-3 md:px-6">
        <label htmlFor={inputId} className="sr-only">
          Message the assistant
        </label>
        <Input
          id={inputId}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about server status..."
          maxLength={8000}
          disabled={isLoading}
          data-testid="admin-chat-input"
        />
        <Button data-testid="admin-chat-send" type="submit" size="icon" aria-label="Send" disabled={!input.trim() || isLoading}>
          <Icon icon={icons.send} />
        </Button>
      </form>
    </>
  )
}
