"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"

import { refreshCleanupData } from "@/actions/admin/cleanup-settings"
import { BuilderForm } from "@/components/admin/cleanup/editor/builder-form"
import { targetElement } from "@/components/admin/cleanup/editor/condition-box"
import { CountBar } from "@/components/admin/cleanup/editor/count-bar"
import { EditorHeader } from "@/components/admin/cleanup/editor/editor-header"
import { ImpactDialog } from "@/components/admin/cleanup/editor/impact-dialog"
import { useEditorPreview, useTypingNumber } from "@/components/admin/cleanup/editor/use-editor-preview"
import { EDITOR_TOASTS, takeTitleFocus, useRuleSave, useRuleState } from "@/components/admin/cleanup/editor/use-rule-state"
import { NewRuleSheet } from "@/components/admin/cleanup/new-rule/new-rule-sheet"
import { recipeLevelOf } from "@/components/admin/cleanup/new-rule/recipe-words"
import { clauseLabels } from "@/components/admin/cleanup/preview/clause-labels"
import { LARGEST_MATCHES_HEADING_ID } from "@/components/admin/cleanup/preview/largest-matches"
import { PreviewCard } from "@/components/admin/cleanup/preview/preview-card"
import { ResultsSection } from "@/components/admin/cleanup/results/results-section"
import { DEFAULT_RESULTS_VIEW, focusResultsHeading, focusResultsTab, RESULTS_HEADING_ID, type ResultsView, viewForTab } from "@/components/admin/cleanup/results/view"
import { WhySheet } from "@/components/admin/cleanup/why/why-sheet"
import { useToast } from "@/components/ui/toast"
import { useLeaveGuard } from "@/hooks/use-leave-guard"
import { SETTINGS_TOASTS } from "@/lib/cleanup/actions/settings/words"
import type { RecipeId } from "@/lib/cleanup/constants"
import { RECIPES } from "@/lib/cleanup/recipes"
import type { EditorError } from "@/lib/cleanup/editor/errors"
import { type FocusTarget, focusForError } from "@/lib/cleanup/editor/focus"
import { findCondition } from "@/lib/cleanup/editor/tree"
import type { PreviewResponse, WhySheetData } from "@/lib/cleanup/types/preview"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import { normaliseForSave } from "@/lib/validations/cleanup-draft"

type TryValue = NonNullable<WhySheetData["tryValue"]>

export interface RuleEditorProps {
  data: CleanupEditorData
  /** The server render's clock (epoch ms): "today", and the age of the first preview. */
  now: number
  /** The job queue is set up (TS 9.5 item 4). */
  redis: boolean
}

/** The recipe list behind "Back to recipes" when the field picker opened a recipe: names only, with no counts. */
const RECIPE_LIST: RecipeCardData[] = RECIPES.map((r) => ({ id: r.id, name: r.name, level: recipeLevelOf(r), sentence: [], keyValues: [], note: null, today: null, needs: [], posters: [] }))

const ruleForm = () => document.querySelector<HTMLElement>('[data-testid="admin-cleanup-rule-form"]')
const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
/** Within the next frames, moves focus to `target()` if focus is lost: on the body, or on an element that left the page. */
function focusIfLost(target: () => HTMLElement | null, frames = 30): void {
  const step = (left: number) => {
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected) target()?.focus()
    else if (left > 0) requestAnimationFrame(() => step(left - 1))
  }
  requestAnimationFrame(() => step(frames))
}
/** The section whose "Why" button opened the Why Sheet. */
type WhyOpener = "largest" | "results"
/** Focus after a Why Sheet action (UX 7.9, ux-a11y-r8-1, owner-r8-1): the title's Why button in the section that opened the Sheet, else its heading. */
const afterAction = (itemKey: string, from: WhyOpener) =>
  from === "largest"
    ? (byTestId(`admin-cleanup-preview-largest-${itemKey}-why`) ?? document.getElementById(LARGEST_MATCHES_HEADING_ID) ?? document.getElementById(RESULTS_HEADING_ID))
    : (byTestId(`admin-cleanup-results-row-${itemKey}-why`) ?? document.getElementById(RESULTS_HEADING_ID))

/**
 * The rule editor (UX 4.3, TS 12.6 editor item 1): the header, the sentence
 * builder, the sticky preview card, Results, the phone count bar, the Why
 * Sheet and the impact dialog, around one draft and one preview query. Each
 * edit shows its count within a second, and a live save shows its impact
 * first. Ctrl S and Cmd S save while the page shows. A reload or a close with
 * changes gets the browser's prompt; an app link keeps the draft in the kept
 * route.
 */
export function RuleEditor({ data, now, redis }: RuleEditorProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const rule = useRuleState(data.rule)
  const { draft: state, saved, dirty } = rule
  const draft = state.draft
  const ruleId = data.rule.id
  const isNew = ruleId === null
  const live = saved.mode !== "dryRun"
  const scope = ruleId ?? "new"
  const [view, setView] = useState<ResultsView>(DEFAULT_RESULTS_VIEW)
  const [editingId, setEditingId] = useState<string | null>(null)
  const typing = useTypingNumber()
  const initial = { definition: data.rule.definition, data: data.initialPreview, updatedAt: now }
  const preview = useEditorPreview({ scope, ruleId, draft, typing, view, focusId: editingId, initial })
  const [errors, setErrors] = useState<EditorError[]>([])
  const [focusRequest, setFocusRequest] = useState<FocusTarget | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const opener = useRef<WhyOpener>("results")
  const [recipe, setRecipe] = useState<RecipeId | null>(null)
  const [refreshing, startRefresh] = useTransition()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const tried = useRef<string | null>(null)
  const acted = useRef<{ key: string; from: WhyOpener; data: PreviewResponse } | null>(null)
  const { saving, confirming, pending, save, confirmImpact, cancelImpact } = useRuleSave({
    rule,
    ruleId,
    currentPreview: preview.current,
    setErrors: (next, focus) => {
      setErrors(next)
      if (focus) setFocusRequest({ kind: "summary" })
    },
  })
  const [shownImpact, setShownImpact] = useState(pending)
  if (pending && pending !== shownImpact) setShownImpact(pending)

  useLeaveGuard(dirty)
  // The router keeps a page it leaves (Activity): open Sheets and dialogs close as the page hides (TS 12.1 rule 8.2)
  useLayoutEffect(
    () => () => {
      setWhy(null)
      cancelImpact()
      setRecipe(null)
    },
    [cancelImpact]
  )
  useEffect(() => {
    if (takeTitleFocus(ruleId)) titleRef.current?.focus()
  }, [ruleId])

  const words = useMemo(() => ({ memberName: (id: string) => data.requesterOptions.find((o) => o.userId === id)?.name ?? null }), [data.requesterOptions])
  const labels = useMemo(() => clauseLabels(draft, words), [draft, words])
  const globals = useMemo(() => Object.fromEntries(data.globalProtections.map((g) => [g.id, g.sentence])), [data.globalProtections])
  const editorData = useMemo(() => ({ ...data, rule: { ...data.rule, definition: saved.definition } }), [data, saved.definition])
  // A fixed problem leaves the summary at once; a new one waits for the next Save (UX 4.4 item 5)
  const shownErrors = useMemo(() => {
    if (errors.length === 0) return errors
    const check = normaliseForSave(draft)
    const failing = new Set(check.success ? [] : check.issues.map((issue) => issue.key))
    return errors.filter((error) => error.code === "VALIDATION" || failing.has(error.key))
  }, [errors, draft])
  // Ctrl S and Cmd S, only while the editor shows: Activity removes the listener when the router hides the page
  const saveKey = useRef(save)
  useEffect(() => {
    saveKey.current = save
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return
      event.preventDefault()
      saveKey.current("save")
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  // After an exclusion from the Why Sheet, the first new preview can drop the row: focus moves only if it was lost (UX 7.9,
  // ux-a11y-r8-2), also when the closing Sheet gives it back to a row that went
  useEffect(() => {
    const done = acted.current
    if (!done || done.data === preview.data) return
    acted.current = null
    focusIfLost(() => afterAction(done.key, done.from))
  }, [preview.data])
  const onTry = (value: TryValue) => {
    const condition = findCondition(draft, value.conditionId)
    if (!condition) return
    rule.dispatch({ type: "update", id: condition.id, condition: { field: condition.field, op: condition.op, value: value.value } })
    tried.current = condition.id
  }
  const whyFinalFocus = () => {
    const id = tried.current
    tried.current = null
    if (id) return targetElement(ruleForm(), { kind: "token", id, part: "value" }) ?? true
    return (acted.current && afterAction(acted.current.key, acted.current.from)) || true
  }
  const whyTitle = why ? (preview.data.rows.find((r) => r.itemKey === why) ?? preview.data.largest.find((r) => r.itemKey === why))?.title : undefined
  const refresh = {
    pending: refreshing,
    disabled: !redis,
    onRefresh: () =>
      startRefresh(async () => {
        const result = await refreshCleanupData()
        if (result.success) toast.showSuccess(SETTINGS_TOASTS.readStarted)
        else toast.showError(result.error)
      }),
  }
  const impact = preview.data.impact

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-cleanup-editor-page">
      <EditorHeader
        ruleId={ruleId}
        name={state.name}
        savedName={saved.name}
        mode={saved.mode}
        level={saved.definition.level}
        lastDryRun={data.rule.lastDryRun}
        now={now}
        dirty={dirty}
        saving={saving}
        redis={redis}
        leavingCount={impact ? impact.leave + impact.keep : 0}
        titleRef={titleRef}
        onRename={(name) => rule.dispatch({ type: "rename", name })}
        onDiscard={() => {
          rule.discard()
          setErrors([])
          toast.showSuccess(EDITOR_TOASTS.discarded)
        }}
        onSave={() => save("save")}
        onSaveThenTurnOn={() => save("turnOn")}
        onRuleChanged={rule.ruleChanged}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <BuilderForm
          draft={state}
          dispatch={rule.dispatch}
          editorData={editorData}
          preview={preview.data}
          updating={preview.updating}
          mode={saved.mode}
          isLive={live}
          errors={shownErrors}
          onOpenRecipe={setRecipe}
          focusRequest={focusRequest}
          onEditingChange={setEditingId}
        />
        <PreviewCard
          data={preview.data}
          labels={labels}
          globals={globals}
          now={now}
          updating={preview.updating}
          rateLimited={preview.rateLimited}
          delta={preview.delta}
          refresh={refresh}
          onWhy={(key) => {
            opener.current = "largest"
            setWhy(key)
          }}
          onSelectTab={(tab) => {
            setView((v) => viewForTab(v, tab))
            focusResultsTab(tab)
          }}
          onChangeCondition={(id) => setFocusRequest(focusForError(draft, id))}
        />
      </div>
      <ResultsSection
        data={preview.data}
        view={view}
        onViewChange={setView}
        labels={labels}
        ruleName={state.name}
        now={now}
        updating={preview.updating}
        onWhy={(key) => {
          opener.current = "results"
          setWhy(key)
        }}
      />
      <CountBar
        preview={preview.data}
        updating={preview.updating}
        quiet={editingId !== null}
        delta={preview.delta}
        isNew={isNew}
        dirty={isNew || dirty}
        saving={saving}
        onResults={focusResultsHeading}
        onSave={() => save("save")}
      />
      <WhySheet
        itemKey={why}
        onClose={() => setWhy(null)}
        scope={scope}
        ruleId={ruleId ?? undefined}
        definition={draft}
        surface="preview"
        title={whyTitle}
        onTry={onTry}
        onActionDone={() => {
          if (why) acted.current = { key: why, from: opener.current, data: preview.data }
          void queryClient.invalidateQueries({ queryKey: ["cleanup-preview", scope] })
        }}
        finalFocus={whyFinalFocus}
      />
      {shownImpact && (
        <ImpactDialog
          open={pending !== null}
          onOpenChange={(open) => !open && cancelImpact()}
          ruleName={saved.name}
          mode={saved.mode}
          level={draft.level}
          impact={shownImpact.impact}
          action={shownImpact.definition.then.action}
          importListExclusion={shownImpact.definition.then.importListExclusion}
          saving={confirming}
          error={shownImpact.error}
          onSave={confirmImpact}
        />
      )}
      <NewRuleSheet
        open={recipe !== null}
        onOpenChange={(open) => !open && setRecipe(null)}
        recipes={RECIPE_LIST}
        recipeId={recipe}
        graceDays={data.options.defaults.graceDays}
        now={now}
      />
    </div>
  )
}
