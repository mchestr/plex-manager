"use client"

import type { KeyboardEvent, ReactNode, RefObject } from "react"

import { TokenPicker } from "@/components/ui/token-picker"
import type { RecipeId } from "@/lib/cleanup/constants"
import { editorFocusPart, type EditorFocusPart } from "@/lib/cleanup/editor/focus"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

import { EditorBody } from "./editor-body"
import { EditorFooter } from "./editor-footer"
import { captionFor, type ConditionEditorFocus, EDITOR_ID, withField } from "./editor-parts"
import { useConditionSession } from "./use-condition-session"

export type { ConditionEditorFocus } from "./editor-parts"

/** The reason on the phone Remove button of a rule's only condition (UX 7.2 item 7, UX 8.4). */
const LAST_CONDITION_REASON = "A rule needs at least one condition"

/**
 * The props of the condition editor, frozen for the sentence builder (plan
 * 2.3). The data props and the callbacks of the brief, then the shell props
 * that `TokenPicker` takes from the row.
 */
export interface ConditionEditorProps {
  /** The condition as the row holds it. The editor copies it each time it opens, and edits the copy. */
  condition: DraftCondition
  /**
   * A condition of "Find ...", or a rule protection of "Never touch". The brief's `role`: a JSX prop
   * named `role` must hold an ARIA role (jsx-a11y/aria-role), so every caller would fail lint.
   */
  conditionRole: "condition" | "protection"
  /** "Condition {index} of {total}", 1-based. A rule's only condition cannot be removed from the phone footer. */
  index: number
  total: number
  level: Level
  /** The part that takes focus as it opens (`editorFocusPart()`, UX 7.9): "fieldSearch" also opens the field list. */
  focusPart: EditorFocusPart
  /** What the preview tells the open editor: preset counts, histogram, computed date and the settled count. */
  focus: ConditionEditorFocus
  /** The members a `request.by` condition can name (audited, `cleanup-requesters`). */
  requesterOptions: readonly RequesterOption[]
  /** The sources of the library data: the field list disables the fields of a service that is not set up. */
  sources: readonly SourceStatus[]
  /** Each change of the copy: chips, selects and the operator at once, typed numbers 500 ms after the last key. */
  onDraftChange: (condition: DraftCondition) => void
  /** Done, Enter in a number, Tab from Done and every close that applies, with a valid value (UX 4.4 item 2). */
  onDone: (condition: DraftCondition) => void
  /** Esc, Cancel and the Sheet's Close button: restore the value from before it opened. */
  onCancel: () => void
  /** The phone footer's "Remove condition". */
  onRemove: () => void
  /** A recipe under "Other matches" in the field list: open the recipe Sheet. The editor stays as it is (UX 7.1). */
  onOpenRecipe?: (id: RecipeId) => void
  open: boolean
  /** The pressed token or phone box: the Popover sits under it, and focus returns to it. */
  anchor: RefObject<HTMLElement | null>
  /** The phone Sheet's "More actions for this condition" menu (`condition-menu.tsx`, UX 4.3.8 item 2.3). */
  headerActions?: ReactNode
  /** Where focus goes on close, when not the anchor: the box of a moved row (UX 7.9). */
  finalFocus?: RefObject<HTMLElement | null>
}

/**
 * The one condition editor that opens from any token (UX 4.4): a Popover
 * under the token from `md`, a bottom Sheet below. It edits a local copy and
 * reports each change with `onDraftChange`, so the preview counts follow.
 * Done (and Enter in a number, Tab from Done, an outside press, focus out,
 * a backdrop press, a swipe) checks the value: a valid one goes to `onDone`,
 * an invalid one keeps the editor open with the X4 message. Esc, Cancel and
 * the Sheet's Close button call `onCancel`.
 */
export function ConditionEditor({
  condition,
  conditionRole,
  index,
  total,
  level,
  focusPart,
  focus,
  requesterOptions,
  sources,
  onDraftChange,
  onDone,
  onCancel,
  onRemove,
  onOpenRecipe,
  open,
  anchor,
  headerActions,
  finalFocus,
}: ConditionEditorProps) {
  const session = useConditionSession({ open, condition, focusPart, onDraftChange })
  const { local } = session

  const done = () => {
    if (session.check() === null) onDone(local)
  }

  const cancel = () => {
    session.discard()
    onCancel()
  }

  const changeOpen = (next: boolean, { cancel: cancelled }: { cancel: boolean }) => {
    if (next) return
    if (cancelled) cancel()
    else done()
  }

  // Tab from Done applies and moves on (UX 4.4 item 3); with a value error it stays, on the error.
  const doneKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Tab" || event.shiftKey || session.check() === null) return
    event.preventDefault()
  }

  const chooseField = (field: DraftCondition["field"]) => {
    const next = withField(local, field, level)
    session.setPicker(false)
    if (next !== local) session.change(next, "now")
    session.moveFocus(editorFocusPart(next, "value"))
  }

  return (
    <TokenPicker
      open={open}
      onOpenChange={changeOpen}
      anchor={anchor}
      title={anyFieldMeta(local.field).label(level)}
      caption={captionFor(conditionRole, index, total)}
      headerActions={headerActions}
      initialFocus={session.initialFocus}
      finalFocus={finalFocus}
      data-testid={EDITOR_ID}
      footer={(shell) => (
        <EditorFooter
          shell={shell}
          matches={focus.matches}
          removeLabel={conditionRole === "protection" ? "Remove protection" : "Remove condition"}
          removeReason={conditionRole === "condition" && total <= 1 ? LAST_CONDITION_REASON : null}
          onCancel={cancel}
          onDone={done}
          onRemove={() => {
            session.discard()
            onRemove()
          }}
          onDoneKeyDown={doneKeyDown}
        />
      )}
    >
      <EditorBody
        condition={local}
        level={level}
        error={session.error}
        picker={session.picker}
        onPickerChange={session.setPicker}
        onChooseField={chooseField}
        onChange={session.change}
        onEnter={done}
        focus={focus}
        requesterOptions={requesterOptions}
        sources={sources}
        onOpenRecipe={onOpenRecipe}
        bodyRef={session.bodyRef}
      />
    </TokenPicker>
  )
}
