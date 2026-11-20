"use client"

import { useState } from "react"

import { sizeText, spokenSize } from "@/components/admin/cleanup/preview/sizes"
import type { DraftAction, UndoRecord } from "@/lib/cleanup/editor/draft"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"

/** An edit that the page speaks once the preview settles (UX 7.10 item 2). */
export interface EditEvent {
  /** Each event is new: the same words twice still speak twice. */
  seq: number
  kind: "added" | "removed" | "restored"
  what: "condition" | "protection" | "group"
  /** The preview on screen at the edit. The message waits for a newer one. */
  previewAt: PreviewResponse
}

/** The rows after the edit: condition rows (group members included) and rule protections. */
interface RowCounts {
  conditions: number
  protections: number
}

/** What an id names: `p` protections, `a` any-of groups, else conditions. @internal */
export const kindOf = (id: string): EditEvent["what"] => (id.startsWith("p") ? "protection" : id.startsWith("a") ? "group" : "condition")

/** The live message an action queues (UX 7.10 item 2): add, remove and Undo only. */
export function editKind(action: DraftAction, undo: UndoRecord | null): Pick<EditEvent, "kind" | "what"> | null {
  switch (action.type) {
    case "remove":
      return { kind: "removed", what: kindOf(action.id) }
    case "undo":
      return undo && { kind: "restored", what: kindOf(undo.removed.id) }
    case "add":
      return { kind: "added", what: action.to === "protections" ? "protection" : "condition" }
    case "addToGroup":
      return { kind: "added", what: "condition" }
    case "addGroup":
      return { kind: "added", what: "group" }
    case "duplicate":
      return { kind: "added", what: kindOf(action.id) }
    default:
      return null
  }
}

const NOUNS = { condition: "Condition", protection: "Protection", group: "Any-of group" } as const

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
const matchCount = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`

/**
 * "Condition added. 4 conditions. 191 matches, 1.2 terabytes." (UX 7.1 step
 * 8), "Condition removed. 2 conditions. 204 matches." (UX 7.2 step 4), and
 * "Condition restored. ..." after Undo. Sizes speak as words (TS 12.7 item 9).
 * @internal Exported for the tests.
 */
export function editMessage(event: Pick<EditEvent, "kind" | "what">, preview: PreviewResponse, rows: RowCounts): string {
  const list = event.what === "protection" ? count(rows.protections, "protection") : count(rows.conditions, "condition")
  const matches = matchCount(preview.matches)
  const tail = event.kind === "added" ? `${matches}, ${spokenSize(sizeText(preview.bytes))}` : matches
  return `${NOUNS[event.what]} ${event.kind}. ${list}. ${tail}.`
}

interface EditMessageOptions {
  event: EditEvent | null
  preview: PreviewResponse
  /** A newer preview is on its way: nothing speaks during "Updating" (UX 7.10 item 4). */
  updating: boolean
  /** A condition editor is open: only its footer speaks (UX 7.10 item 3). A new row speaks after it closes. */
  editing: boolean
  rows: RowCounts
}

/**
 * The words of the edit region: the last event, spoken once with the counts
 * of the first preview that settles after it, while no editor is open. A
 * later preview never changes words already spoken.
 */
export function useEditMessage({ event, preview, updating, editing, rows }: EditMessageOptions): string {
  const [spoken, setSpoken] = useState<{ seq: number; text: string } | null>(null)
  if (event && event.seq !== spoken?.seq && !updating && !editing && preview !== event.previewAt) {
    setSpoken({ seq: event.seq, text: editMessage(event, preview, rows) })
  }
  return spoken?.text ?? ""
}

/** The polite region of add, remove and undo messages (UX 7.10 item 2). Save results speak through the toast. */
export function EditRegion({ text }: { text: string }) {
  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only" data-slot="edit-region">
      {text}
    </p>
  )
}

/**
 * The settled count as words: "197 matches, 1.3 terabytes. 6 more than
 * before." (UX 7.3 step 5). `delta` is the change since the last edit.
 * @internal Exported for the tests.
 */
export function countMessage(preview: PreviewResponse, delta: number | null): string {
  const matches = matchCount(preview.matches)
  const change = delta ? ` ${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} than before.` : ""
  return `${matches}, ${spokenSize(sizeText(preview.bytes))}.${change}`
}

interface CountRegionProps {
  preview: PreviewResponse
  updating: boolean
  /** A condition editor is open: the region keeps its words until it closes (UX 7.10 item 3). */
  quiet: boolean
  delta: number | null
  className?: string
}

/**
 * The polite region of the settled count (UX 7.10 item 1). The count bar
 * holds it below `lg`. Its words change only to a settled count while no
 * condition editor is open, so nothing speaks during "Updating" and the
 * settled count speaks once after Done (UX 7.3 step 5).
 */
export function CountRegion({ preview, updating, quiet, delta, className }: CountRegionProps) {
  const next = countMessage(preview, delta)
  const [text, setText] = useState(next)
  if (!updating && !quiet && next !== text) setText(next)
  return (
    <p aria-live="polite" aria-atomic="true" className={className ?? "sr-only"} data-slot="count-region">
      {text}
    </p>
  )
}
