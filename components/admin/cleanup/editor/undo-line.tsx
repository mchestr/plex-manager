"use client"

import { Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { UndoRecord } from "@/lib/cleanup/editor/draft"
import { isGroup } from "@/lib/cleanup/editor/tree"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { draftRowParts, partsText } from "@/lib/cleanup/fields/sentence"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** "Condition removed: Plays at least 3 in total." (UX 7.2 item 2, UX 8.4). A group reads "Any-of group removed: ...". */
export function undoText(undo: UndoRecord, level: Level, words?: DescribeWords): string {
  const sentence = (c: Parameters<typeof draftRowParts>[0]) => partsText(draftRowParts(c, level, words).parts)
  const { removed } = undo
  if (isGroup(removed)) return `Any-of group removed: ${removed.conditions.map(sentence).join(", or ")}.`
  return `Condition removed: ${sentence(removed)}.`
}

interface UndoLineProps {
  undo: UndoRecord
  level: Level
  words?: DescribeWords
  onUndo: () => void
}

/**
 * The line a removed row turns into (UX 7.2): "Condition removed: {sentence}."
 * and "Undo". No dialog opens. It has no timer (SC 2.2.1): it stays until the
 * next edit, Save, Discard or leaving the page, because the draft reducer
 * clears the undo record then. Undo puts the row back in its place.
 */
export function UndoLine({ undo, level, words, onUndo }: UndoLineProps) {
  const id = undo.removed.id
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-dashed border-border-strong px-3 py-2 text-ui text-muted-foreground md:ml-10"
      data-testid={`admin-cleanup-undo-${id}`}
    >
      <Icon icon={Undo2} className="shrink-0" />
      <p className="min-w-0 flex-1">{undoText(undo, level, words)}</p>
      <Button variant="outline" size="sm" onClick={onUndo} className="max-md:h-11" data-testid={`admin-cleanup-undo-${id}-button`}>
        Undo
      </Button>
    </div>
  )
}
