"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { previewCleanupRecipe } from "@/actions/admin/cleanup-preview"
import { queryKeys } from "@/hooks/query-keys"
import type { RecipeId } from "@/lib/cleanup/constants"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import type { RecipePreview } from "@/lib/cleanup/types/preview"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** A refusal of `previewCleanupRecipe`. `message` is the action's own safe copy. */
export class RecipePreviewFailed extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "RecipePreviewFailed"
    this.code = code
  }
}

export interface RecipePreviewOptions {
  recipeId: RecipeId
  level: Level
  /** The key values in their URL form ("180d", "107374182400", "30"). */
  values: Record<string, string>
  enabled?: boolean
}

/**
 * The live result of the recipe step (UX 4.2.2, TS 10.5 `RecipePreview`)
 * through `previewCleanupRecipe`. The key is the recipe, the level and the
 * values (TS 10.7), so each chip press asks once; the last result stays
 * while the next one loads. A typed "Other" value is debounced by the caller.
 *
 * @example
 * ```ts
 * const preview = useRecipePreview({ recipeId: "never-watched-movies", level: "movie", values: { added: "180d" } })
 * ```
 */
export function useRecipePreview({ recipeId, level, values, enabled = true }: RecipePreviewOptions) {
  return useQuery({
    queryKey: queryKeys.cleanupRecipePreview(recipeId, level, stableJson(values)),
    queryFn: async (): Promise<RecipePreview> => {
      const result = await previewCleanupRecipe({ recipeId, ...(level === "season" ? {} : { level }), values })
      if (!result.success) throw new RecipePreviewFailed(result.code, result.error)
      return result.data
    },
    placeholderData: keepPreviousData,
    retry: false,
    enabled,
  })
}
