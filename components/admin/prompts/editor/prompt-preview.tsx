"use client"

import { useMemo } from "react"

import { systemPrompt } from "@/lib/wrapped/prompt/rewind-2026"

/**
 * The system prompt Rewind sends, built by the pipeline's own
 * `systemPrompt()` (so it can't drift), with the style-guide block marked.
 */
export function PromptPreview({ styleGuide }: { styleGuide: string }) {
  const { base, block } = useMemo(() => {
    const frozen = systemPrompt(null)
    const full = systemPrompt(styleGuide)
    return { base: frozen, block: full.slice(frozen.length) }
  }, [styleGuide])

  return (
    <section aria-labelledby="prompt-preview-heading" className="flex flex-col gap-2">
      <h2 id="prompt-preview-heading" className="text-h3">
        Preview
      </h2>
      <p className="text-label text-muted-foreground">
        The system prompt Rewind sends. Your style guide is appended last and highlighted.
      </p>
      <pre
        tabIndex={0}
        aria-label="Assembled system prompt"
        className="max-h-[480px] overflow-auto rounded-md border border-border bg-muted p-4 font-mono text-label whitespace-pre-wrap text-muted-foreground"
        data-testid="admin-prompt-editor-preview"
      >
        {base}
        {block && <mark className="rounded-sm bg-primary/15 text-foreground">{block}</mark>}
      </pre>
    </section>
  )
}
