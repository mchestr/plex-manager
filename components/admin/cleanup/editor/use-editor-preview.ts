"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { DEFAULT_RESULTS_VIEW, type ResultsView } from "@/components/admin/cleanup/results/view"
import { fetchCleanupPreview, PreviewRateLimited, previewKey, useCleanupPreview } from "@/hooks/use-cleanup-preview"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { PreviewRequest } from "@/lib/validations/cleanup-actions"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

/** A typed number waits this long after the last key (UX 7.11 item 2, TS 10.7). */
export const TYPED_DELAY_MS = 500

/** How long a preview of the same draft and view stays good enough for the impact of a save. */
const IMPACT_FRESH_MS = 10_000

/** The input of a typed number: the condition editor waits for its own numbers, so only numbers outside it count. */
export function isTypedNumber(element: Element | null): boolean {
  return element instanceof HTMLElement && element.matches('[data-slot="number-field-input"]') && !element.closest('[data-testid="admin-cleanup-condition-editor"]')
}

/** True while focus is in a typed number outside the condition editor, such as the "Other" grace period. */
export function useTypingNumber(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const update = () => setTyping(isTypedNumber(document.activeElement))
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)
    return () => {
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
    }
  }, [])
  return typing
}

/** The draft to ask about: the draft at once, or, while `typing`, the draft once it has not changed for 500 ms. */
function useSentDraft(draft: RuleDraft, typing: boolean): RuleDraft {
  const [sent, setSent] = useState(draft)
  if (!typing && sent !== draft) setSent(draft)
  useEffect(() => {
    if (!typing) return
    const timer = setTimeout(() => setSent(draft), TYPED_DELAY_MS)
    return () => clearTimeout(timer)
  }, [typing, draft])
  return typing ? sent : draft
}

export interface EditorPreviewOptions {
  /** The rule id, or "new". */
  scope: string
  /** A saved rule: the preview counts its impact on Leaving soon (live rules). */
  ruleId: string | null
  draft: RuleDraft
  /** Focus is in a typed number: the draft waits 500 ms after its last change. Blur sends it at once. */
  typing: boolean
  view: ResultsView
  /** The condition whose editor is open: its histogram and preset counts. */
  focusId: string | null
  /** The server render's preview of `definition` in the default view, and the render time (epoch ms). */
  initial: { definition: RuleDraft; data: PreviewResponse; updatedAt: number }
}

export interface EditorPreview {
  /** The newest result, settled or not. */
  data: PreviewResponse
  /** A newer result is on its way. */
  updating: boolean
  /** The last request got a 429: "Too many updates. The preview pauses for a minute." */
  rateLimited: boolean
  /** Matches of the settled draft minus those of the last settled result before the edit. Null before an edit and while one loads. */
  delta: number | null
  /** The settled preview of the draft as it is now, asked for if needed: the impact of a live save. */
  current: () => Promise<PreviewResponse>
}

/** The request of a draft in a view (TS 10.6, 10.7). */
export function previewRequest(definition: RuleDraft, ruleId: string | null, view: ResultsView, focusId: string | null): PreviewRequest {
  return {
    definition,
    ...(ruleId ? { ruleId } : {}),
    tab: view.tab,
    sort: view.sort,
    page: view.page,
    ...(view.search ? { search: view.search } : {}),
    ...(view.chip && view.tab === "nearMisses" ? { nearMissCondition: view.chip } : {}),
    ...(focusId ? { focus: { conditionId: focusId } } : {}),
  }
}

/**
 * The one preview query of the rule editor (plan D11, TS 10.7, UX 7.11): the
 * preview card, the count bar, Results and the open condition editor read
 * it. It is keyed by scope, `stableJson(draft)` and the view (tab, sort,
 * page, search, chip, focus id). A key change aborts the request before it,
 * and the last result stays while the next one loads. The server render's
 * preview seeds the first key. Each time the kept route shows the editor
 * again (Activity), the preview loads again, so a newer snapshot shows.
 */
export function useEditorPreview({ scope, ruleId, draft, typing, view, focusId, initial }: EditorPreviewOptions): EditorPreview {
  const queryClient = useQueryClient()
  const sent = useSentDraft(draft, typing)
  const request = previewRequest(sent, ruleId, view, focusId)
  const seed = { request: previewRequest(initial.definition, ruleId, DEFAULT_RESULTS_VIEW, null), data: initial.data, updatedAt: initial.updatedAt }
  const query = useCleanupPreview({ scope, request, initial: seed })
  const data = query.data ?? initial.data

  // The delta (UX 4.3.6): this draft's settled matches against the last settled result before the edit
  const draftKey = stableJson(sent)
  const [last, setLast] = useState<{ key: string; matches: number } | null>(null)
  const [base, setBase] = useState<{ key: string; matches: number } | null>(null)
  const own = query.data && !query.isPlaceholderData ? query.data : null
  if (own && (last?.key !== draftKey || last.matches !== own.matches)) setLast({ key: draftKey, matches: own.matches })
  if (last && last.key !== draftKey && base?.key !== draftKey) setBase({ key: draftKey, matches: last.matches })
  const delta = base?.key === draftKey && last?.key === draftKey ? last.matches - base.matches : null

  // Activity runs effects again each time it shows the kept editor: the first run is the mount, which has the server's preview
  const shown = useRef(false)
  const { refetch } = query
  useEffect(() => {
    if (shown.current) void refetch()
    shown.current = true
  }, [refetch])

  return {
    data,
    updating: query.isFetching,
    rateLimited: query.error instanceof PreviewRateLimited,
    delta,
    current: async () => {
      const now = previewRequest(draft, ruleId, view, focusId)
      if (own && stableJson(draft) === draftKey) return own
      return queryClient.fetchQuery({
        queryKey: previewKey(scope, now),
        queryFn: ({ signal }) => fetchCleanupPreview(now, signal),
        staleTime: IMPACT_FRESH_MS,
      })
    },
  }
}
