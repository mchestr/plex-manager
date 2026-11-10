"use client"

import { useQuery } from "@tanstack/react-query"

import { getCleanupItemWhy } from "@/actions/admin/cleanup-preview"
import { queryKeys } from "@/hooks/query-keys"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import type { WhySheetData } from "@/lib/cleanup/types/preview"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

/** A refusal of `getCleanupItemWhy`. `message` is the action's own safe copy. */
export class CleanupWhyFailed extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "CleanupWhyFailed"
    this.code = code
  }
}

export interface CleanupWhyOptions {
  /** The title to explain; null keeps the query idle (the Sheet is closed). */
  itemKey: string | null
  /** The rule id, or "new" (TS 10.7). */
  scope: string
  ruleId?: string
  /** The editor's draft: the Why of a preview row, with Try. */
  definition?: RuleDraft
  /** History: the stored Why of this outcome. */
  outcomeId?: string
  enabled?: boolean
}

/** The draft part of the key: the outcome, the draft as stable JSON, or the saved rule. */
const draftKeyOf = ({ outcomeId, definition }: Pick<CleanupWhyOptions, "outcomeId" | "definition">) =>
  outcomeId !== undefined ? `outcome:${outcomeId}` : definition ? stableJson(definition) : "saved"

/**
 * The Why Sheet data of one title (TS 10.5, UX 4.5), through
 * `getCleanupItemWhy`. It loads while `itemKey` is set, and asks again
 * when the draft changes, so Try and the verdicts follow the editor.
 *
 * @example
 * ```ts
 * const why = useCleanupWhy({ itemKey: open, scope: rule?.id ?? "new", ruleId: rule?.id, definition: draft })
 * ```
 */
export function useCleanupWhy({ itemKey, scope, ruleId, definition, outcomeId, enabled = true }: CleanupWhyOptions) {
  return useQuery({
    queryKey: queryKeys.cleanupWhy(itemKey ?? "", scope, draftKeyOf({ outcomeId, definition })),
    queryFn: async (): Promise<WhySheetData> => {
      const result = await getCleanupItemWhy({
        itemKey: itemKey ?? "",
        ...(ruleId !== undefined ? { ruleId } : {}),
        ...(definition !== undefined ? { definition } : {}),
        ...(outcomeId !== undefined ? { outcomeId } : {}),
      })
      if (!result.success) throw new CleanupWhyFailed(result.code, result.error)
      return result.data
    },
    enabled: enabled && itemKey !== null,
    retry: false,
    staleTime: 0,
  })
}
