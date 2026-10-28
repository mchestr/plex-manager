"use client"

import { useId, useState, type FormEvent, type KeyboardEvent, type Ref } from "react"

import type { SendOutcome } from "@/components/admin/assistant/use-assistant-chat"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Textarea } from "@/components/ui/textarea"
import { icons } from "@/lib/ui/icons"

/** The longest message the action takes (SEC-42). */
const MAX_CHARS = 8000

interface AssistantComposerProps {
  /** A reply is on its way: typing goes on, sending waits. */
  pending: boolean
  /** The assistant is off, so nothing can be sent. */
  disabled: boolean
  onSend: (text: string) => Promise<SendOutcome>
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * The message box: Enter sends and Shift+Enter starts a new line. It stays
 * enabled and focused while a reply loads. A message the assistant refused
 * comes back into the box, unless something new was typed meanwhile.
 */
export function AssistantComposer({ pending, disabled, onSend, ref }: AssistantComposerProps) {
  const [draft, setDraft] = useState("")
  const inputId = useId()
  const canSend = draft.trim().length > 0 && !pending && !disabled

  const send = async () => {
    if (!canSend) return
    const text = draft
    setDraft("")
    if ((await onSend(text)) === "failed") setDraft((current) => (current.trim() ? current : text))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Not while an input method is composing a character
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <label htmlFor={inputId} className="sr-only">
        Message the assistant
      </label>
      <Textarea
        ref={ref}
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about your server…"
        maxLength={MAX_CHARS}
        rows={1}
        disabled={disabled}
        className="field-sizing-content max-h-48 min-h-10 resize-none md:min-h-9"
        data-testid="admin-chat-input"
      />
      <Button data-testid="admin-chat-send" type="submit" size="icon" aria-label="Send" disabled={!canSend}>
        <Icon icon={icons.send} />
      </Button>
    </form>
  )
}
