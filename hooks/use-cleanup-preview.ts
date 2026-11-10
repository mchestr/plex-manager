"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/hooks/query-keys"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { PreviewRequest } from "@/lib/validations/cleanup-actions"

/** The route of the live preview (TS 10.6). */
export const CLEANUP_PREVIEW_URL = "/api/admin/cleanup/preview"

/** How long the server render's preview stays fresh for its own key (TS 10.7). */
const INITIAL_STALE_MS = 30_000

/** A 429 from the preview route: the card shows "Too many updates. The preview pauses for a minute." */
export class PreviewRateLimited extends Error {
  readonly retryAfterSec: number | null
  constructor(retryAfterSec: number | null) {
    super("Too many updates. The preview pauses for a minute.")
    this.name = "PreviewRateLimited"
    this.retryAfterSec = retryAfterSec
  }
}

/** Any other answer that is not a preview. The message holds no server text. */
export class PreviewFailed extends Error {
  readonly status: number
  constructor(status: number) {
    super("The preview did not load.")
    this.name = "PreviewFailed"
    this.status = status
  }
}

/** The view part of the key (TS 10.7): tab, sort, page, search, near-miss chip and focus id. */
export function previewView(request: PreviewRequest): string {
  return [request.tab ?? "matches", request.sort ?? "largest", request.page ?? 1, request.search ?? "", request.nearMissCondition ?? "",
    request.focus?.conditionId ?? ""].join("|")
}

/** The query key of a preview: the rule id or "new", the draft, and the view. */
export function previewKey(scope: string, request: PreviewRequest) {
  return queryKeys.cleanupPreview(scope, stableJson(request.definition), previewView(request))
}

/** One POST of the preview. TanStack Query passes `signal`, so a key change aborts the request before it. */
export async function fetchCleanupPreview(request: PreviewRequest, signal?: AbortSignal): Promise<PreviewResponse> {
  const response = await fetch(CLEANUP_PREVIEW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  })
  if (response.status === 429) {
    const retry = Number(response.headers.get("Retry-After"))
    throw new PreviewRateLimited(Number.isFinite(retry) && retry > 0 ? retry : null)
  }
  if (!response.ok) throw new PreviewFailed(response.status)
  return (await response.json()) as PreviewResponse
}

export interface CleanupPreviewOptions {
  /** The rule id, or "new". */
  scope: string
  request: PreviewRequest
  /** The server render's preview, the request it answers, and the render time (epoch ms). */
  initial?: { request: PreviewRequest; data: PreviewResponse; updatedAt: number } | null
  enabled?: boolean
}

/**
 * The live preview of a rule draft (TS 10.7, UX 7.11). Each new key aborts
 * the request before it, and the last result stays (`keepPreviousData`)
 * while the next one loads. The first key gets the server render's preview
 * as `initialData`, fresh for 30 s, so the editor does not ask again at
 * mount. Typed numbers are debounced by the caller (500 ms).
 *
 * @example
 * ```ts
 * const preview = useCleanupPreview({ scope: rule.id, request: { definition: draft, tab, sort, page }, initial })
 * if (preview.error instanceof PreviewRateLimited) // "Too many updates. ..."
 * ```
 */
export function useCleanupPreview({ scope, request, initial, enabled = true }: CleanupPreviewOptions) {
  const key = previewKey(scope, request)
  const seed = initial && stableJson(previewKey(scope, initial.request)) === stableJson(key) ? initial : null
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchCleanupPreview(request, signal),
    placeholderData: keepPreviousData,
    retry: false,
    enabled,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
    staleTime: seed ? INITIAL_STALE_MS : 0,
  })
}
