"use client"

import { Table } from "lucide-react"

import { ArticleBlockView } from "@/components/rewind/article/article-block"
import { useQuiz } from "@/components/rewind/stage/quiz-context"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import type { PageTable } from "@/lib/rewind/registry"
import { cn } from "@/lib/utils"

import { SPREAD_SIDE } from "./geometry"

interface NotesColumnProps {
  /** "05": the current page's folio. */
  folio: string
  pageName: string
  /** The page's Notes blocks (`pageNotes`), built on the server. */
  notes: readonly ArticleBlock[]
  /** The Notes once the quiz is answered or skipped (P8.4), so the Guess Notes never spoil it. */
  answeredNotes?: readonly ArticleBlock[] | null
  /** The page's own `table()`, which "Show as table" swaps in; null hides the toggle. */
  table: PageTable | null
  showTable: boolean
  onToggleTable: () => void
  /** "Story card, 1080 by 1920", or null on a page that offers no card. */
  formats: string | null
}

/**
 * The spread's right column (design 4.7): Notes that extend the page rather
 * than repeat it, "Show as table" (`rewind-notes-table-toggle`, also T on
 * desktop) for the page's own chart, and the share formats at the foot. It
 * is the only part of the spread that scrolls, vertically, and it keeps the
 * arrow keys for that (`data-rw-scroll`).
 */
export function NotesColumn({ folio, pageName, notes: before, answeredNotes, table, showTable, onToggleTable, formats }: NotesColumnProps) {
  const { answer } = useQuiz()
  const notes = answer && answeredNotes ? answeredNotes : before
  const label = `Notes on page ${folio}, ${pageName}`
  const asTable = showTable && table !== null

  return (
    <aside aria-label={label} data-rw-scroll className={cn(SPREAD_SIDE, "pointer-events-auto right-6 w-(--rw-notes-w) pl-2 font-text")} data-testid="rewind-notes">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-ui font-semibold">{label}</p>
        {table && (
          <Button
            variant="ink-outline"
            size="pill"
            aria-pressed={asTable}
            data-testid="rewind-notes-table-toggle"
            onClick={onToggleTable}
            icon={<Icon icon={Table} />}
          >
            Show as table
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-4 text-body" data-testid="rewind-notes-body" data-view={asTable ? "table" : "notes"}>
        {asTable ? <ArticleBlockView block={{ kind: "table", table }} /> : notes.map((block, i) => <ArticleBlockView key={i} block={block} />)}
      </div>
      {formats && (
        <p className="mt-6 border-t border-current pt-3 font-display text-ui" data-testid="rewind-notes-formats">
          <span className="font-semibold">Share as</span> {formats}
        </p>
      )}
    </aside>
  )
}
