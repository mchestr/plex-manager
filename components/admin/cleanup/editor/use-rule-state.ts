"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from "react"

import { createCleanupRule, saveCleanupRule } from "@/actions/admin/cleanup-rules"
import { impactCount } from "@/components/admin/cleanup/editor/impact-dialog"
import type { RuleChange } from "@/components/admin/cleanup/rules/rule-card-menu"
import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { cleanupRule, cleanupTurnOn } from "@/lib/admin/routes"
import { type DraftAction, draftReducer, type DraftState, initDraftState } from "@/lib/cleanup/editor/draft"
import { draftErrors, type EditorError, errorsFromFieldErrors } from "@/lib/cleanup/editor/errors"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import type { PreviewImpact, PreviewResponse } from "@/lib/cleanup/types/preview"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import { normaliseForSave, type RuleDraft } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

type EditorRule = CleanupEditorData["rule"]

/** The rule as the editor last knew it on the server: the base of "Unsaved changes" and of a discard. */
interface SavedRule {
  /** The compare-and-set revision (E25). Null for a new rule. */
  revision: number | null
  mode: Mode
  name: string
  definition: RuleDraft
}

/** A save that went through: the new revision, and the name and definition the server stored. */
interface SavedAs {
  revision: number
  name: string
  definition: RuleDraft
  /** The draft that the save sent. The draft resets to `definition` only if it did not change while the save ran. */
  sent: RuleDraft
}

type EditorAction = DraftAction | { type: "savedAs"; saved: SavedAs }

/** The draft reducer, plus "savedAs": the draft takes the stored definition, unless it changed while the save ran. */
function editorReducer(state: DraftState, action: EditorAction): DraftState {
  if (action.type !== "savedAs") return draftReducer(state, action)
  const { saved } = action
  const unchanged = state.name.trim() === saved.name && stableJson(state.draft) === stableJson(saved.sent)
  return unchanged ? draftReducer(state, { type: "reset", draft: saved.definition, name: saved.name }) : state
}

const savedOf = (rule: EditorRule): SavedRule => ({ revision: rule.revision, mode: rule.mode, name: rule.name, definition: rule.definition })

/** A server render whose rule has a higher revision than the editor's own (E34). */
const isNewer = (rule: EditorRule, own: SavedRule) => rule.revision !== null && own.revision !== null && rule.revision > own.revision

/** True when the draft differs from the saved rule: its name, or its definition with keys in any order. @internal */
export const isDirty = (state: DraftState, saved: Pick<SavedRule, "name" | "definition">): boolean =>
  state.name !== saved.name || stableJson(state.draft) !== stableJson(saved.definition)

export interface RuleState {
  /** The draft reducer state: the draft, the name and the undo record. */
  draft: DraftState
  dispatch: (action: DraftAction) => void
  /** The rule as the editor knows it on the server: `revision` and `mode` come only from the sources of TS 12.6 item 1.1. */
  saved: SavedRule
  dirty: boolean
  /** A mode change from the editor's own menu: the new revision and mode, and the draft stays (architecture-r2-1). */
  ruleChanged: (change: RuleChange) => void
  /** A `saveCleanupRule` result. */
  savedAs: (saved: SavedAs) => void
  /** "Discard changes...": the draft goes back to the saved rule, or to a newer server render of it (TS 12.6 item 1.5). */
  discard: () => void
  /** After a create: the draft and its undo record go back to the newest start draft (TS 12.6 item 1.7.2). */
  resetToStart: () => void
}

/**
 * The rule state of the editor root (TS 12.6 editor items 1 and 8, E25,
 * E34): the draft reducer, and the rule's `revision` and `mode`, set only
 * from the first load, each save result and the editor's own menu.
 *
 * A server render can bring the rule again: a `revalidatePath` refresh, or a
 * visit that shows the kept route (cacheComponents keeps up to 3 visited
 * routes in a hidden Activity). A newer revision with no unsaved changes
 * replaces the draft and clears its undo record. With unsaved changes the
 * editor keeps its own revision and mode, so the next save gets CONFLICT.
 * An equal or lower revision changes nothing.
 */
export function useRuleState(rule: EditorRule): RuleState {
  const [draft, dispatch] = useReducer(editorReducer, rule, (r) => initDraftState(r.definition, r.name))
  const [saved, setSaved] = useState<SavedRule>(() => savedOf(rule))
  // The last server revision the editor looked at: each new one is a server render to follow or not
  const [seen, setSeen] = useState(rule.revision)
  const dirty = isDirty(draft, saved)

  const take = (next: EditorRule) => {
    setSaved(savedOf(next))
    dispatch({ type: "reset", draft: next.definition, name: next.name })
  }

  if (rule.revision !== seen) {
    setSeen(rule.revision)
    if (isNewer(rule, saved) && !dirty) take(rule)
  }

  // The newest start draft and server render, for the resets that run after an await
  const latest = useRef({ rule, saved })
  useEffect(() => {
    latest.current = { rule, saved }
  })

  return {
    draft,
    dispatch,
    saved,
    dirty,
    ruleChanged: ({ revision, mode }) => setSaved((s) => ({ ...s, revision, mode })),
    savedAs: (next) => {
      setSaved((s) => ({ ...s, revision: next.revision, name: next.name, definition: next.definition }))
      dispatch({ type: "savedAs", saved: next })
    },
    discard: () => {
      const { rule: newest, saved: own } = latest.current
      if (isNewer(newest, own)) take(newest)
      else dispatch({ type: "reset", draft: own.definition, name: own.name })
    },
    resetToStart: () => {
      const start = latest.current.rule
      setSaved(savedOf(start))
      dispatch({ type: "reset", draft: start.definition, name: start.name })
    },
  }
}

/** The rule whose page title takes focus when its editor mounts: the rule just created (UX 7.9 "Create rule"). */
let titleFocusFor: string | null = null

/** Asks the editor of `ruleId` to focus its `h1` when it mounts. @internal */
export function focusTitleOnArrival(ruleId: string): void {
  titleFocusFor = ruleId
}

/** True once for the rule that `focusTitleOnArrival()` named. */
export function takeTitleFocus(ruleId: string | null): boolean {
  if (ruleId === null || titleFocusFor !== ruleId) return false
  titleFocusFor = null
  return true
}

/** The toasts of UX 8.9 that the editor shows. */
export const EDITOR_TOASTS = {
  created: "Rule created",
  saved: "Rule saved",
  savedBusy: "Rule saved. A run is in progress. At its end, titles that no longer match leave Leaving soon.",
  discarded: "Changes discarded",
} as const

/** "Save rule" and Ctrl S, or "Save and turn on..." and "Save and change mode...", which open the turn-on page after the save. */
type SaveIntent = "save" | "turnOn"

/** A live save that waits for the impact dialog (UX 7.7 item 3.2). */
interface PendingImpact {
  impact: PreviewImpact
  definition: RuleDefinition
  sent: RuleDraft
  intent: SaveIntent
  /** A refusal of the confirmed save, shown in the dialog (UX 7.12). */
  error: string | null
}

export interface RuleSaveOptions {
  rule: RuleState
  /** Null for a new rule: Save creates it. */
  ruleId: string | null
  /** The settled preview of the draft as it is now (its `impact`). */
  currentPreview: () => Promise<PreviewResponse>
  /** Save errors: the summary shows them, and focus moves to it. An empty list clears them. */
  setErrors: (errors: EditorError[], focus: boolean) => void
}

export interface RuleSave {
  /** A save, or its impact read, runs. */
  saving: boolean
  /** The save that "Save changes" confirmed runs: the impact dialog shows it. */
  confirming: boolean
  pending: PendingImpact | null
  save: (intent: SaveIntent) => void
  /** "Save changes" in the impact dialog: the save with `confirmImpact`. */
  confirmImpact: () => void
  /** "Keep editing": the press ends, and the editor stays as it is. Stable. */
  cancelImpact: () => void
}

/**
 * Save and create (UX 7.7, TS 10.3): the draft is checked first, and its
 * problems go to the error summary. A new rule is created in Dry run, the
 * draft goes back to its start, and the rule page opens with focus on its
 * title. A Dry run rule saves at once. A live rule saves at once unless the
 * draft moves titles in or out of Leaving soon or gives them a less careful
 * action: then the impact dialog opens first. A stale revision gives the
 * CONFLICT words. A failed save stays in the editor with its draft.
 */
export function useRuleSave({ rule, ruleId, currentPreview, setErrors }: RuleSaveOptions): RuleSave {
  const router = useRouter()
  const toast = useToast()
  const [saving, startSaving] = useTransition()
  const [confirming, startConfirm] = useTransition()
  const [pending, setPending] = useState<PendingImpact | null>(null)
  const { draft: state, saved, dirty } = rule
  const showErrors = (errors: EditorError[]) => setErrors(errors, true)
  const cancelImpact = useCallback(() => setPending(null), [])

  const write = async (definition: RuleDefinition, sent: RuleDraft, intent: SaveIntent, confirmImpact: boolean): Promise<void> => {
    if (ruleId === null || saved.revision === null) return
    const name = state.name.trim()
    const result = await saveCleanupRule({ ruleId, name, definition, expectedRevision: saved.revision, confirmImpact })
    if (!result.success) {
      if (result.code === "CLEANUP_IMPACT_UNCONFIRMED" && !confirmImpact) return askImpact(definition, sent, intent, true)
      if (result.code === "VALIDATION" && result.fieldErrors) {
        setPending(null)
        return showErrors(errorsFromFieldErrors(sent, result.fieldErrors))
      }
      if (confirmImpact) return setPending((p) => p && { ...p, error: result.error })
      return toast.showError(result.error)
    }
    setPending(null)
    setErrors([], false)
    rule.savedAs({ revision: result.data.revision, name, definition, sent })
    toast.showSuccess(result.data.exitsApplied ? EDITOR_TOASTS.saved : EDITOR_TOASTS.savedBusy)
    if (intent === "turnOn") router.push(cleanupTurnOn(ruleId))
  }

  /** A live save: the impact of the draft as it is now. Titles that move open the dialog; else the save goes on. */
  const askImpact = async (definition: RuleDefinition, sent: RuleDraft, intent: SaveIntent, refused = false): Promise<void> => {
    let fresh: PreviewResponse
    try {
      fresh = await currentPreview()
    } catch {
      return toast.showError(CONFIRM_FALLBACK_ERROR)
    }
    const impact = fresh.impact
    if (impact && impactCount(impact) > 0) return setPending({ impact, definition, sent, intent, error: null })
    if (refused) return toast.showError(CONFIRM_FALLBACK_ERROR)
    return write(definition, sent, intent, false)
  }

  const create = async (definition: RuleDefinition, sent: RuleDraft): Promise<void> => {
    const result = await createCleanupRule({ name: state.name.trim(), definition })
    if (!result.success) {
      if (result.code === "VALIDATION" && result.fieldErrors) return showErrors(errorsFromFieldErrors(sent, result.fieldErrors))
      return toast.showError(result.error)
    }
    toast.showSuccess(EDITOR_TOASTS.created)
    setErrors([], false)
    rule.resetToStart()
    focusTitleOnArrival(result.data.ruleId)
    router.push(cleanupRule(result.data.ruleId))
  }

  return {
    saving: saving || confirming,
    confirming,
    pending,
    save: (intent) => {
      if (saving || confirming || pending || (ruleId !== null && !dirty)) return
      const sent = state.draft
      const normalised = normaliseForSave(sent)
      if (!normalised.success) return showErrors(draftErrors(sent, normalised.issues))
      startSaving(async () => {
        if (ruleId === null) await create(normalised.data, sent)
        else if (saved.mode !== "dryRun") await askImpact(normalised.data, sent, intent)
        else await write(normalised.data, sent, intent, false)
      })
    },
    confirmImpact: () => {
      if (pending && !confirming) startConfirm(() => write(pending.definition, pending.sent, pending.intent, true))
    },
    cancelImpact,
  }
}
