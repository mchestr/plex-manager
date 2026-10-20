import type { ReactNode } from "react"

import { inkProps } from "@/lib/design/tokens"
import type { ArticleText } from "@/lib/rewind/article/blocks"
import type { ArticleSection } from "@/lib/rewind/article/sections"
import { cn } from "@/lib/utils"

import { ArticleBlockView, ArticleTextView } from "./article-block"

interface ArticleDocumentProps {
  /** The masthead's `h1`: "The 2026 issue". */
  title: string
  /** Lines under the title: the server and serial, the data window. */
  masthead: ArticleText[]
  sections: readonly ArticleSection[]
  /** Links out of the article ("Play the story"), hidden in print. */
  actions?: ReactNode
}

/**
 * Article mode (P5.12, design 11.1): a whole issue as one semantic
 * `<article>` on paper. It needs no JavaScript and prints cleanly: an `h1`
 * masthead, one `<section aria-labelledby>` per page with an `h2` such as
 * "05 Top shows", then the page's blocks. P7.13's legacy years and P7.9's
 * admin preview render through it with their own sections.
 */
export function ArticleDocument({ title, masthead, sections, actions }: ArticleDocumentProps) {
  const paper = inkProps("paper")
  return (
    <article
      {...paper}
      lang="en"
      data-testid="rewind-article-mode"
      data-rewind-article=""
      className={cn(paper.className, "min-h-dvh bg-background font-text text-base leading-relaxed text-foreground")}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-8 sm:px-8">
        <header className="flex flex-col gap-2 border-b-2 border-current pb-6">
          <h1 className="font-lead text-4xl leading-tight">{title}</h1>
          {masthead.map((line, i) => (
            <p key={i} className="font-display">
              <ArticleTextView text={line} />
            </p>
          ))}
          {actions && (
            <nav aria-label="Article" className="mt-2 flex flex-wrap gap-4" data-print-hide="">
              {actions}
            </nav>
          )}
        </header>
        {sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`${section.id}-heading`}
            data-article-page={section.type ?? undefined}
            data-testid="rewind-article-section"
            className="flex flex-col gap-4 border-b border-current/40 pb-10"
          >
            <h2 id={`${section.id}-heading`} className="font-display text-xl font-bold">
              {section.folio !== null && <span className="tabular-nums">{String(section.folio).padStart(2, "0")} </span>}
              {section.name}
            </h2>
            {section.blocks.map((block, i) => (
              <ArticleBlockView key={i} block={block} />
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}
