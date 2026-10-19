import ReactMarkdown from "react-markdown"
import { SafeLink } from "@/components/ui/safe-link"
import { cn } from "@/lib/utils"
import { MARKDOWN_ELEMENTS } from "@/lib/ui/markdown"

interface MarkdownBodyProps {
  /** Markdown written by an admin or a model. Never trusted. */
  children: string
  className?: string
  "data-testid"?: string
}

/**
 * Untrusted Markdown, rendered safely (SEC-42) and styled by typeset (UI-25).
 * Only `MARKDOWN_ELEMENTS` survive; any other element is unwrapped to its
 * text, raw HTML is skipped and there is no `rehype-raw`, so an injected image
 * never loads. Links go through `SafeLink`. No `'use client'`: this renders in
 * Server and Client Components alike.
 */
export function MarkdownBody({ children, className, "data-testid": testId }: MarkdownBodyProps) {
  return (
    <div className={cn("typeset", className)} data-testid={testId}>
      <ReactMarkdown allowedElements={MARKDOWN_ELEMENTS} unwrapDisallowed skipHtml components={{ a: SafeLink }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
