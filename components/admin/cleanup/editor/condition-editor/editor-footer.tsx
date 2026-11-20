"use client"

import { type KeyboardEvent, useId } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { TokenPickerShell } from "@/components/ui/token-picker"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"

import { editorId, matchesWord } from "./editor-parts"

interface EditorFooterProps {
  shell: TokenPickerShell
  /** The rule's matches with the editor's value; null until a preview settles. */
  matches: number | null
  /** "Remove condition", or "Remove protection" in Never touch. */
  removeLabel: string
  /** Why Remove is disabled, or null. The last condition of a rule cannot go (UX 7.2 item 7). */
  removeReason: string | null
  onCancel: () => void
  onDone: () => void
  onRemove: () => void
  /** Tab from Done applies, so a value error stops it there (UX 4.4 item 3). */
  onDoneKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * The condition editor's footer (UX 4.4). In the Popover: the polite count
 * "With this value: 197 matches", Cancel and Done. In the phone Sheet:
 * "Remove condition" and Done at 44 px, with the count for screen readers
 * only; the Sheet's Close button cancels. While the editor is open, this
 * count is the only one that speaks (UX 7.10 item 3).
 */
export function EditorFooter({ shell, matches, removeLabel, removeReason, onCancel, onDone, onRemove, onDoneKeyDown }: EditorFooterProps) {
  const f = useFormat()
  const reasonId = useId()
  const count = (
    <p
      aria-live="polite"
      aria-atomic="true"
      data-testid={editorId("count")}
      className={shell === "sheet" ? "sr-only" : "mr-auto min-w-0 text-label text-muted-foreground"}
    >
      {matches !== null && (
        <>
          With this value: <strong className="font-semibold text-foreground tabular-nums">{f.number(matches)}</strong> {matchesWord(matches)}
        </>
      )}
    </p>
  )

  if (shell === "sheet") {
    return (
      <>
        {count}
        <Button
          variant="destructive"
          size="lg"
          icon={<Icon icon={icons.delete} />}
          onClick={onRemove}
          disabled={removeReason !== null}
          focusableWhenDisabled
          aria-describedby={removeReason === null ? undefined : reasonId}
          data-testid={editorId("remove")}
          className="flex-1"
        >
          {removeLabel}
        </Button>
        {removeReason !== null && (
          <span id={reasonId} className="sr-only">
            {removeReason}
          </span>
        )}
        <Button size="lg" onClick={onDone} data-testid={editorId("done")} className="flex-1">
          Done
        </Button>
      </>
    )
  }

  return (
    <>
      {count}
      <Button variant="ghost" size="sm" onClick={onCancel} data-testid={editorId("cancel")}>
        Cancel
      </Button>
      <Button size="sm" onClick={onDone} onKeyDown={onDoneKeyDown} data-testid={editorId("done")}>
        Done
      </Button>
    </>
  )
}
