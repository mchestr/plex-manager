import type { ComponentProps } from "react"
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"
import { SafeLink } from "@/components/ui/safe-link"
import { cn } from "@/lib/utils"
import { MARKDOWN_ELEMENTS } from "@/lib/ui/markdown"

interface MarkdownBodyProps {
  /** Markdown written by an admin or a model. Never trusted. */
  children: string
  className?: string
  "data-testid"?: string
}

function ScrollTable({ node, ...props }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="typeset-scroll">
      <table {...props} />
    </div>
  )
}

/** The page owns its h1, and typeset styles h2 to h4 only. */
function headingAs(Tag: "h2" | "h4") {
  return function Heading({ node, ...props }: ComponentProps<"h2"> & ExtraProps) {
    return <Tag {...props} />
  }
}

const COMPONENTS: Components = {
  a: SafeLink,
  table: ScrollTable,
  h1: headingAs("h2"),
  h5: headingAs("h4"),
  h6: headingAs("h4"),
}

/**
 * Untrusted Markdown, rendered safely (SEC-42) and styled by typeset (UI-25).
 * Only `MARKDOWN_ELEMENTS` survive; any other element is unwrapped to its
 * text, raw HTML is skipped and there is no `rehype-raw`, so an injected image
 * never loads. Links go through `SafeLink`. GFM (`remark-gfm`) adds tables,
 * which scroll sideways in typeset's `typeset-scroll` wrapper rather than
 * squeezing their columns, strikethrough and bare-URL links. No
 * `'use client'`: this renders in Server and Client Components alike.
 */
export function MarkdownBody({ children, className, "data-testid": testId }: MarkdownBodyProps) {
  return (
    <div className={cn("typeset", className)} data-testid={testId}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={MARKDOWN_ELEMENTS}
        unwrapDisallowed
        skipHtml
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
