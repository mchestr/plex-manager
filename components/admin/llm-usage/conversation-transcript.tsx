import { ExpandablePrompt } from "@/components/admin/llm-usage/expandable-prompt"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { parseTranscript } from "@/lib/admin/conversation-transcript"

/**
 * The conversation's latest prompt as a transcript (P10.6): each chat message
 * through `MarkdownBody`, tool JSON as code. A prompt that is not a chat
 * message array falls back to the raw prompt.
 */
export function ConversationTranscript({ prompt }: { prompt: string }) {
  const messages = parseTranscript(prompt)
  if (!messages) {
    return <ExpandablePrompt content={prompt} title="Latest prompt" characterCount={prompt.length} />
  }

  return (
    <section aria-labelledby="conversation-transcript-heading" className="flex flex-col gap-3" data-testid="conversation-transcript">
      <h2 id="conversation-transcript-heading" className="text-h3">
        Transcript
      </h2>
      <ol className="flex flex-col gap-2">
        {messages.map((message, index) => (
          <li key={index} className="flex flex-col gap-1.5 rounded-lg border bg-card p-4">
            <p className="text-label text-muted-foreground">{message.speaker}</p>
            {message.json ? (
              <pre className="overflow-x-auto rounded-sm bg-muted p-3 font-mono text-caption text-foreground">{message.content}</pre>
            ) : (
              <MarkdownBody>{message.content}</MarkdownBody>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
