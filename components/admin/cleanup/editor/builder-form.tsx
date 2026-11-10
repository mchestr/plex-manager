"use client"

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { type Anchor, anchorOf, failedSources, rowElement, type RowKit, targetElement } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionEditor } from "@/components/admin/cleanup/editor/condition-editor/condition-editor"
import { ConditionMenu } from "@/components/admin/cleanup/editor/condition-menu"
import { ConditionsFieldset } from "@/components/admin/cleanup/editor/conditions-fieldset"
import { ErrorSummary } from "@/components/admin/cleanup/editor/error-summary"
import { EditRegion, type EditEvent, editKind, useEditMessage } from "@/components/admin/cleanup/editor/live-region"
import { PlainWords } from "@/components/admin/cleanup/editor/plain-words"
import { ProtectionsFieldset } from "@/components/admin/cleanup/editor/protections-fieldset"
import { ScopeFieldset } from "@/components/admin/cleanup/editor/scope-fieldset"
import { ThenFieldset } from "@/components/admin/cleanup/editor/then-fieldset"
import type { RecipeId } from "@/lib/cleanup/constants"
import { describeRule } from "@/lib/cleanup/describe"
import { type DraftAction, draftReducer, type DraftState } from "@/lib/cleanup/editor/draft"
import type { EditorError } from "@/lib/cleanup/editor/errors"
import { editorFocusPart, type EditorFocusPart, focusAfter, focusForError, type FocusTarget } from "@/lib/cleanup/editor/focus"
import { sameJson } from "@/lib/cleanup/editor/stable-json"
import { findCondition, findGroup, flatConditions, isGroup, notApplicableIds, rowIds } from "@/lib/cleanup/editor/tree"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { draftRowParts, partsText } from "@/lib/cleanup/fields/sentence"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

export interface BuilderFormProps {
  /** The state of `draftReducer`: the draft, the name and the undo record. */
  draft: DraftState
  dispatch: (action: DraftAction) => void
  editorData: CleanupEditorData
  /** The newest preview, settled or not (the editor root's one query, plan D11). */
  preview: PreviewResponse
  /** A newer preview is on its way: nothing speaks, and the editor footer keeps the settled count. */
  updating: boolean
  mode: Mode
  /** Review first or Automatic: the level token is read only (UX 7.5 item 2). */
  isLive: boolean
  /** Save errors (`draftErrors()` or `errorsFromFieldErrors()`), shown in the summary and under each part. */
  errors: readonly EditorError[]
  /** A recipe under "Other matches" of the field picker (UX 7.1). */
  onOpenRecipe: (id: RecipeId) => void
  /**
   * A focus move that starts outside the builder (UX 7.9): `{ kind: "summary" }`
   * after a Save with errors, the changed token after Try, the editor of a
   * preview "Change {field}" button. Each new object moves focus once.
   */
  focusRequest?: FocusTarget | null
  /** The condition whose editor is open, or null: the preview's `focus.conditionId` and the count bar's `quiet`. */
  onEditingChange?: (conditionId: string | null) => void
}

/** The open (or last) condition editor. It stays mounted after it closes, so focus returns to its anchor. */
interface Editing {
  id: string
  anchor: Anchor
  focus: EditorFocusPart
  /** The condition when the editor opened: Esc and Cancel restore it (UX 7.3 item 6). */
  original: DraftCondition
  open: boolean
}

/**
 * The sentence builder (UX 4.3.3, 7): one form with the four parts Clean up,
 * Find ..., Never touch and Then, the Save error summary at its top, and
 * "In plain words" under it. It is controlled: the editor root owns the draft
 * reducer and the preview. Each row opens the one condition editor at the
 * pressed part; each draft action moves focus by UX 7.9; add, remove and
 * Undo speak once the preview settles (UX 7.10).
 */
export function BuilderForm(props: BuilderFormProps) {
  const { draft: state, dispatch, editorData, preview, updating, mode, isLive, errors, onOpenRecipe, focusRequest, onEditingChange } = props
  const draft = state.draft
  const formId = useId()
  const f = useFormat()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [focusNext, setFocusNext] = useState<{ target: FocusTarget; closing: boolean } | null>(null)
  const [event, setEvent] = useState<EditEvent | null>(null)
  const [libraries, setLibraries] = useState<object | null>(null)
  const [thenRequest, setThenRequest] = useState<{ name: "grace" | "action" } | null>(null)
  const [settled, setSettled] = useState<number | null>(updating ? null : preview.matches)
  if (!updating && settled !== preview.matches) setSettled(preview.matches)

  const openEditor = (id: string, anchor: Anchor, focus?: EditorFocusPart, from = draft) => {
    const condition = findCondition(from, id)
    if (!condition) return
    setEditing({ id, anchor, focus: focus ?? editorFocusPart(condition, anchor), original: condition, open: true })
    setFocusNext(null)
  }

  const goTo = (target: FocusTarget, closing = false, from = draft) => {
    if (target.kind === "editor") return openEditor(target.id, anchorOf(target.part), target.part, from)
    if (target.kind === "control" && target.name === "libraries") setLibraries({})
    if (target.kind === "control" && target.name !== "libraries") setThenRequest({ name: target.name })
    setFocusNext({ target, closing })
  }

  const [seen, setSeen] = useState(focusRequest)
  if (focusRequest !== seen) {
    setSeen(focusRequest)
    if (focusRequest) goTo(focusRequest)
  }

  /** One draft action from a row, a menu or Undo: dispatch it, then move focus and queue its live message. */
  const act = (action: DraftAction, closing = false) => {
    const after = draftReducer(state, action)
    if (after === state) return
    dispatch(action)
    const spoken = editKind(action, state.undo)
    if (spoken) setEvent({ ...spoken, seq: (event?.seq ?? 0) + 1, previewAt: preview })
    const group = action.type === "ungroup" ? findGroup(draft, action.groupId) : null
    const target = group ? { kind: "row" as const, id: group.conditions[0].id } : focusAfter(action, state, after)
    if (target) goTo(target, closing, after.draft)
  }

  const closeEditor = () => setEditing((e) => e && { ...e, open: false })
  // The router keeps a page it leaves (Activity): the editor closes as the page hides (TS 12.1 rule 8.2)
  useLayoutEffect(() => () => setEditing(null), [])

  useEffect(() => {
    if (focusNext && !focusNext.closing) targetElement(document.getElementById(formId), focusNext.target)?.focus()
  }, [focusNext, formId])

  const openId = editing?.open ? editing.id : null
  const notify = useRef(onEditingChange)
  useEffect(() => {
    notify.current = onEditingChange
  })
  useEffect(() => {
    notify.current?.(openId)
  }, [openId])

  const words = useMemo<DescribeWords>(
    () => ({ memberName: (userId) => editorData.requesterOptions.find((o) => o.userId === userId)?.name ?? null }),
    [editorData.requesterOptions]
  )
  const flat = flatConditions(draft.conditions)
  const sentenceOf = (c: DraftCondition) => partsText(draftRowParts(c, draft.level, words).parts)
  const kit: RowKit = {
    level: draft.level,
    words,
    saved: editorData.rule.id ? editorData.rule.definition : null,
    errors: new Map(errors.map((e) => [e.key, e.message])),
    held: new Map(preview.clauses.map((c) => [c.id, c.heldBack])),
    keeps: new Map(preview.protectedBy.map((p) => [p.protectionId, p.count])),
    failed: failedSources(preview, f.time),
    historyStart: preview.snapshot?.historyStart ?? null,
    zone: editorData.zone,
    open: editing?.open ? { id: editing.id, anchor: editing.anchor } : null,
    targets: draft.conditions.flatMap((c) => (isGroup(c) ? [] : [{ id: c.id, sentence: sentenceOf(c) }])),
    conditionCount: flat.length,
    onOpen: (id, anchor) => openEditor(id, anchor),
    onAction: (action) => act(action),
  }

  const anchor = useMemo(
    () => ({
      get current() {
        return editing ? rowElement(document.getElementById(formId), editing.id, editing.anchor) : null
      },
    }),
    [editing, formId]
  )
  const finalFocus = useMemo(
    () => ({
      get current() {
        const root = document.getElementById(formId)
        const next = focusNext?.closing ? targetElement(root, focusNext.target) : null
        return next ?? (editing ? rowElement(root, editing.id, editing.anchor) : null)
      },
    }),
    [editing, focusNext, formId]
  )

  const rows = { conditions: flat.length, protections: draft.protections.length }
  const message = useEditMessage({ event, preview, updating, editing: openId !== null, rows })
  const thenError = errors.find((e) => e.key.startsWith("then."))?.message ?? null
  const libraryError = errors.find((e) => e.key === "libraries")?.message ?? null
  const notApplicable = notApplicableIds(draft).flatMap((id) => {
    const c = findCondition(draft, id)
    return c ? [sentenceOf(c)] : []
  })
  const sentence = describeRule(draft, {
    ...words,
    libraryTitle: (id) => editorData.libraries.find((l) => l.sectionId === id)?.title ?? null,
    mode,
  })

  const current = editing ? (findCondition(draft, editing.id) ?? editing.original) : null
  const list = current?.id.startsWith("p") ? "protections" : "conditions"
  const order = rowIds(draft, list)
  const inGroup = current !== null && list === "conditions" && !draft.conditions.some((c) => c.id === current.id)

  return (
    <div className="flex flex-col gap-4" data-slot="rule-builder">
      <form
        id={formId}
        aria-label="Rule"
        noValidate
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col rounded-lg border bg-card text-card-foreground [&>section+section]:border-t"
        data-testid="admin-cleanup-rule-form"
      >
        {errors.length > 0 && (
          <div className="px-5 pt-5">
            <ErrorSummary errors={errors} onSelect={(key) => goTo(focusForError(draft, key))} />
          </div>
        )}
        <section className="p-5">
          <ScopeFieldset
            level={draft.level}
            libraries={draft.libraries}
            options={editorData.libraries}
            isLive={isLive}
            notApplicable={notApplicable}
            error={libraryError}
            onLevel={(level, ids) => dispatch({ type: "setLevel", level, libraries: ids })}
            onLibraries={(ids) => dispatch({ type: "setLibraries", libraries: ids })}
            openLibraries={libraries}
          />
        </section>
        <section className="p-5">
          <ConditionsFieldset clauses={draft.conditions} kit={kit} undo={state.undo} />
        </section>
        <section className="p-5">
          <ProtectionsFieldset
            protections={draft.protections}
            kit={kit}
            undo={state.undo}
            globals={editorData.globalProtections}
            counts={kit.keeps}
            kept={preview.protectedGlobal}
          />
        </section>
        <section className="p-5">
          <ThenFieldset
            then={draft.then}
            level={draft.level}
            mode={mode}
            minGrace={editorData.options.automaticMinGraceDays}
            zone={editorData.zone}
            error={thenError}
            onThen={(then) => dispatch({ type: "setThen", then })}
            openRequest={thenRequest}
          />
        </section>
        <EditRegion text={message} />
      </form>
      <PlainWords parts={sentence} />
      {editing && current && (
        <ConditionEditor
          condition={current}
          conditionRole={list === "protections" ? "protection" : "condition"}
          index={order.indexOf(current.id) + 1}
          total={order.length}
          level={draft.level}
          focusPart={editing.focus}
          focus={{ data: preview.focus, matches: settled, historyStart: preview.snapshot?.historyStart ?? null, zone: editorData.zone }}
          requesterOptions={editorData.requesterOptions}
          sources={preview.sources}
          onDraftChange={(next) => dispatch({ type: "update", id: current.id, condition: next })}
          onDone={(next) => {
            if (!sameJson(next, current)) dispatch({ type: "update", id: current.id, condition: next })
            closeEditor()
          }}
          onCancel={() => {
            if (!sameJson(editing.original, current)) dispatch({ type: "update", id: current.id, condition: editing.original })
            closeEditor()
          }}
          onRemove={() => {
            closeEditor()
            act({ type: "remove", id: current.id }, true)
          }}
          onOpenRecipe={onOpenRecipe}
          open={editing.open}
          anchor={anchor}
          finalFocus={finalFocus}
          headerActions={
            <ConditionMenu
              id={current.id}
              kind={list === "protections" ? "protection" : inGroup ? "member" : "condition"}
              targets={kit.targets}
              variant="sheet"
              canRemove={list === "protections" || flat.length > 1}
              onAction={(action) => {
                closeEditor()
                act(action, true)
              }}
            />
          }
        />
      )}
    </div>
  )
}
