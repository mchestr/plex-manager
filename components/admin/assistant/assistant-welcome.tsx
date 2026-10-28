"use client"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

/** Questions the read-only tools every role holds can answer. @internal */
export const SUGGESTIONS = ["Who is streaming right now?", "What was watched most this week?", "Is every service healthy?"]

interface AssistantWelcomeProps {
  /** Off while the assistant cannot answer; the page says why beside the message box. */
  suggest: boolean
  onPick: (question: string) => void
}

/** What a new conversation shows: what to ask about, and questions to start with. */
export function AssistantWelcome({ suggest, onPick }: AssistantWelcomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center" data-testid="admin-chat-welcome">
      <span className="flex size-10 items-center justify-center rounded-full border bg-muted text-muted-foreground">
        <Icon icon={icons.assistant} size={20} />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-h2">Ask about your server</h2>
        <p className="text-ui text-muted-foreground">
          Ask about streams, watch history, requests, downloads or service health.
        </p>
      </div>
      {suggest && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Suggested questions">
          {SUGGESTIONS.map((question, index) => (
            <li key={question}>
              <Button variant="outline" size="sm" onClick={() => onPick(question)} data-testid={`admin-chat-suggestion-${index}`}>
                {question}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
